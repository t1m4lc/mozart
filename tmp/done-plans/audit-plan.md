# Audit Plan — Shell Polish + Agent Streaming MVP (fusion of 09-shell-polish-mvp.md + eng-review audit)

**Sources merged:** `tmp/ready-plans/09-shell-polish-mvp.md` (existing) + live repo audit (this pass).
**Reference image:** `docs/competitors/conductor/design/conductor-ui.png` — **source of truth** for UI deltas (supersedes DESIGN.md where they conflict, per Q1 decision).
**Date:** 2026-05-11
**Confidence:** 8/10.

---

## Décisions verrouillées (Q1–Q8)

| # | Décision | Implication |
|---|---|---|
| Q1 | **Supprimer** Settings + About du TopBar. Image Conductor = source of truth, DESIGN.md § Settings ignoré pour 1.8b. | S1.8b.1: retirer les deux boutons (pas de tooltip "Coming in 1.8d"). |
| Q2 | **Pas de polling.** Wirer un event `tauri-specta` pour la fin de run. `lib.rs:130` mount déjà `setup_builder.mount_events(app)` — il manque la déclaration + l'émission depuis `mark_ended`. | S1.8b.4: replacer le poller 1.5 s par un `AgentRunTerminated { run_id, status }` event Rust + écoute front. ~30 lignes Rust supplémentaires; pas de DB load; pas de lag. |
| Q3 | **Différer à 1.8c.** `AppError::Validation(String)` reste tel quel pour 1.8b. | AddRepoDialog ship avec message générique; ticket 1.8c séparé pour `RepoIssue` typé. |
| Q4 | **Text-only.** Champ texte pour le path absolu; bouton `[Browse…]` disabled tooltip "Coming in 1.8c". | S1.8b.5: pas d'install de `tauri-plugin-dialog` dans 1.8b. |
| Q5 | **Cancel\|Primary partout.** | S1.8b.5: pas de `platform.service.ts`; ordre unique sur les 3 OS. |
| Q6 | **Skip.** Le seam `window.__mz` + ngrx Devtools suffisent pour 1.8b. | Pas d'atome dev DB stats. |
| Q7 | **Cross-platform `decorations: false`.** | S1.8b.1: macOS traffic-light overlay déféré à 1.8c (polish séparé). |
| Q8 | **Différer plan 10.** Workspace pills = status-dot + title + branch subtitle uniquement en 1.8b. | Pas de fold-in dans S1.8b.3; ticket plan 10 séparé. |

---

## 0. Audit scope & method

Five vectors audited:

1. **LLM streaming** — transport, parser, abort, lifecycle.
2. **Abort/stop** — Rust kill chain + front-end exposure.
3. **Workspace generation flow** — UI → store → bindings → Tauri → Rust.
4. **Rust↔Angular command coverage** — every `#[tauri::command]` cross-referenced with `bindings.service.ts` consumers AND with actual UI callers.
5. **UI delta vs Conductor v0.6.0** — 3-panel shell, conversational center, right pane affordances.

No code generated; no mockups produced. All findings are file:line-anchored to the current tree.

---

## 1. Per-feature factual findings

### 1.1 LLM streaming (Claude CLI subprocess → UI)

| Layer | Status | Evidence |
|---|---|---|
| Transport | ✅ Tauri `ipc::Channel<StreamEvent>` — **not** SSE, **not** WebSocket, **not** Tauri events. | `apps/desktop/src-tauri/src/commands/mod.rs:197` (`on_event: Channel<StreamEvent>`), `_bindings.ts:83` (`TAURI_CHANNEL<StreamEvent>`) |
| Claude argv | ✅ Locked: `-p <prompt> --output-format=stream-json --include-partial-messages`. D1.4-C enforced + unit-tested. | `claude_cli/runner.rs:113-120,452-480` |
| Parser | ✅ Variants emitted v0.0.1: `StreamToken`, `CliOutput`, `Error`. `ToolCall` + `StatusUpdate` declared but **not emitted** by `parse_line` (D1.4-A). | `claude_cli/mod.rs:14-26`, `_bindings.ts:201-213` |
| Stdout drain | ✅ `BufReader::lines` per line → `parse_line` → channel.send + `agent_events::insert`. | `runner.rs:184-224` |
| Stderr drain | ✅ Each non-empty line → `StreamEvent::Error` + `agent_events` row (event_type='error'); last line buffered for `agent_runs.error_message`. | `runner.rs:227-273` |
| Lifecycle | ✅ Supervisor task awaits child, joins drains, calls `agent_runs::mark_ended` with status ∈ {done, error, stopped, crashed}; on `done` only, captures diff via `sandbox::capture_diff` and inserts one `workspace_changes` row. | `runner.rs:275-424` |
| Front consumer | ❌ **Not wired.** `bindings.service.ts:172-177` explicitly carries `TODO(plan-09)` and excludes both `startAgentRun` and `stopAgentRun`. No component reads `StreamEvent`. | `bindings.service.ts:172-177` |
| Natural-end notification | ⚠ No Rust → JS signal that the run reached a terminal status. Plan 09 polls `listRuns` every 1.5 s — works but adds DB load and ≤1.5 s lag. Alternative: emit a `tauri-specta` event on `agent_runs::mark_ended`. | `runner.rs:371-381` (mark_ended call site has no event emit), `_bindings.ts:165` ("user-defined events" section is empty) |

### 1.2 Abort / stop

| Layer | Status | Evidence |
|---|---|---|
| Rust kill chain | ✅ `stop_agent_run(run_id)` → `RunRegistry.cancel` → `Arc<AtomicBool>` flip → supervisor polls flag (20 ms tick) → `child.start_kill()` (SIGKILL on Unix per tokio) + `kill_on_drop(true)` belt-and-brace → wait + `mark_ended("stopped", …)`. D1.4-E locked. | `run_registry.rs:29-42`, `runner.rs:79-82,288-305` |
| Unknown id | ✅ Returns `AppError::NotFound`. Unit-tested at `commands/mod.rs:858-865`. | `run_registry.rs:38-41` |
| Front exposure | ❌ Not wired in `bindings.service.ts`. No "Stop" button anywhere in the shell. | `bindings.service.ts:172-177` |
| Idempotency | ✅ Cancel on a finished handle is a no-op by Rust design; registry is not evicted on completion (deliberate per D1.4-E + run_registry.rs:1-5). | `run_registry.rs:1-5` |

### 1.3 Workspace generation flow

End-to-end happy path:

```
UI button (NOT WIRED)
  → ProjectStore.addRepo / WorkspaceStore.createWorkspace (METHODS MISSING)
    → BindingsService.addRepo / createWorkspace (EXISTS, ✅)
      → commands.addRepo / createWorkspace (auto-generated, ✅)
        → invoke('add_repo' | 'create_workspace')
          → commands/mod.rs::add_repo_impl / create_workspace_impl (✅, fully tested)
            → git_query::validate_repo (typed RepoIssue → flattened) / workspace_service::create_workspace
              → DB rows: repos, tasks, workspaces, threads
              → worktree.rs creates ~/.mozart/worktrees/{workspace_id}/ (D18 path lock)
```

| Step | Status | Notes |
|---|---|---|
| `addRepo` Rust impl | ✅ idempotent; collapses `RepoIssue` into `AppError::Validation(format!("repo not usable: {issue:?}"))` | `commands/mod.rs:59-81` |
| `createWorkspace` Rust impl | ✅ resolves repo_id→path, then `workspace_service::create_workspace` orchestrates everything (D1.6 path lock + rollback). | `commands/mod.rs:108-127` |
| `BindingsService.addRepo` | ✅ wraps envelope + zod parse | `bindings.service.ts:140-141` |
| `BindingsService.createWorkspace` | ✅ wraps envelope + zod parse | `bindings.service.ts:143-151` |
| `ProjectStore.addRepo()` | ❌ Method does not exist — only `refresh / select / toggleExpanded` | `project.store.ts` |
| `WorkspaceStore.createWorkspace()` | ❌ Method does not exist — only `refresh / select / workspacesForProject` | `workspace.store.ts` |
| UI dialog `AddRepoDialog` | ❌ Does not exist | n/a |
| UI dialog `CreateWorkspaceDialog` | ❌ Does not exist; `sidebar-empty.component.ts` only renders a non-wired placeholder card | `sidebar-empty.component.ts` |
| Sidebar `+ Add project` button | ⚠ Present but `disabled` with tooltip "Coming in 1.8d" | `sidebar.component.ts` (strip `+` button) |
| Project row `+ New workspace` button | ⚠ Present but `disabled` with tooltip "Coming in 1.8d" | `project-row.component.ts:49-58` |
| **Validation UX gap** | ⚠ Typed `RepoIssue` (NestedRepo / Submodules / NonGit / DetachedHEAD per DESIGN.md D16) is flattened to `AppError::Validation(string)` at the Rust boundary. Front receives `{ kind: 'Validation', message: "repo not usable: <Debug>" }` — can't render per-case copy required by DESIGN.md AddRepository state matrix. | `commands/mod.rs:62-64` |

### 1.4 Rust↔Angular command coverage matrix

13 Tauri commands in `commands/mod.rs`:

| # | Rust command | `BindingsService` wrapper | Actual UI consumer | Verdict |
|---|---|---|---|---|
| 1 | `list_repos` | `listRepos` ✅ | `ProjectStore.refresh()` ✅ | ✅ |
| 2 | `add_repo(path)` | `addRepo` ✅ | none (sidebar `+` disabled) | ❌ UI dead end |
| 3 | `list_branches(repo_path)` | `listBranches` ✅ | none — never called anywhere | ❌ UI dead end |
| 4 | `create_workspace(repo_id, base_branch, task_text)` | `createWorkspace` ✅ | none (project-row `+` disabled) | ❌ UI dead end |
| 5 | `list_workspaces` | `listWorkspaces` ✅ | `WorkspaceStore.refresh()` ✅ | ✅ |
| 6 | `list_tasks(repo_id)` | `listTasks` ✅ | `TaskStore.refresh()` ✅ | ✅ |
| 7 | `archive_workspace(workspace_id)` | `archiveWorkspace` ✅ | none (workspace-item archive button disabled) | ❌ UI dead end (plan 09 deletes it; OK) |
| 8 | `start_agent_run(workspace_id, prompt, channel)` | ❌ **NOT EXPOSED** (TODO plan-09) | none | ❌ Blocking |
| 9 | `stop_agent_run(run_id)` | ❌ **NOT EXPOSED** (TODO plan-09) | none | ❌ Blocking |
| 10 | `list_runs(workspace_id)` | `listRuns` ✅ | none — but plan 09 polls it for natural-end | ⚠ pending plan 09 |
| 11 | `get_workspace_diff(workspace_id)` | `getWorkspaceDiff` ✅ | none — no diff viewer | ❌ UI dead end (deferred to plan 10) |
| 12 | `discard_workspace_changes(workspace_id)` | `discardWorkspaceChanges` ✅ | none — no UI control | ❌ UI dead end (deferred) |
| 13 | `check_claude_install` | `checkClaudeInstall` ✅ | none — no onboarding screen | ❌ UI dead end (Step 1.9 onboarding) |

**Summary:**
- 2 commands not even exposed in `BindingsService` (streaming pair) — plan 09 addresses both.
- 6 commands exposed but with zero UI consumer (`addRepo`, `listBranches`, `createWorkspace`, `archiveWorkspace`, `getWorkspaceDiff`, `discardWorkspaceChanges`, `checkClaudeInstall`). Plan 09 lights up `addRepo`, `listBranches`, `createWorkspace`. The other four belong to plans 10/11/Step 1.9 — keep that demarcation.

### 1.5 DB visualization in dev

| Layer | Status | Evidence |
|---|---|---|
| SQLite location | `~/.local/share/com.tauri.dev/mozart.db` (placeholder identifier) | `tauri.conf.json:4`, `lib.rs:111-122` |
| Dev seam | `window.__mz.bindings` exposed under `isDevMode()` only — DevTools can call any binding from console | `app.config.ts:34-37` |
| Dev UI | ❌ No in-app browser for `repos`, `tasks`, `workspaces`, `agent_runs`, `agent_events`, `workspace_changes`. | n/a |
| ngrx Devtools | ✅ Each SignalStore registers `withDevtools(name)` — `projects`, `workspaces`, `tasks`. Redux-DevTools shows state. | `project.store.ts:62`, `workspace.store.ts:60`, `shortcut.service.ts` (unused devtools) |
| Logs | ✅ `tauri_plugin_log` Info under `cfg(debug_assertions)`. Streamed to terminal where `pnpm dev` runs. | `lib.rs:101-108` |

**Gap:** there is no way to *visually inspect SQLite state from inside the app*. Plan 09 doesn't add one — fine for MVP, but worth a deferred ticket because the dev loop is currently "open Redux DevTools and call `__mz.bindings.listRuns(wid)` by hand."

### 1.6 Window / chrome / identifier

| Property | Current | Plan 09 target |
|---|---|---|
| Window default | 800×600 | 1400×900 |
| Decorations (OS titlebar) | unspecified → native | `decorations: false` (cross-platform) |
| App identifier | `com.tauri.dev` | `build.mozart.desktop` (moves DB path) |
| `core:window:*` capabilities | absent | add close/min/max/is_maximized |
| Custom drag region | none | `data-tauri-drag-region` on TopBar host |
| Settings + About buttons | present, disabled, tooltip "Coming in 1.8d" | **removed** by plan 09 — see open question Q1 |

### 1.7 Sidebar — current vs Conductor

| Element | Current | Conductor v0.6.0 (image) | Plan 09 |
|---|---|---|---|
| Width | 220 px (`--sidebar-width`) | ~200 px with collapsible icon-rail | 260 px |
| Top strip | `[≡][←][→] PROJECTS [+]` — all 4 disabled | `History (⌘K)` + `Projects` + `+ Add repository` | enable only the `+ Add project` (others stay disabled per DESIGN.md) |
| Project row | chevron + name + hover `[+]` + `[⚙]`, both disabled | chevron + name + `[+]` enabled when <4/4 capacity | enable `+ New workspace`; visual flatten |
| Workspace item | 8 px status dot + 14 px title + 12 px mono branch subtitle + hover archive slot (disabled) | status dot + title + +/- diff counts right-aligned; right-click context menu | remove archive slot; single-row pill; branch subtitle on hover only |
| Diff counts | ❌ Not surfaced | ✅ `+12 −3` right-aligned per workspace | ❌ Not added by plan 09 — see new task ND4 below |
| Context menu (Mark unread / Pin / status / Rename / Archive) | ❌ Right-click intercepted but no menu | ✅ Full menu | ❌ Deferred per DESIGN.md (v0.1 status labels only) |
| `[≡]` collapse | ❌ Disabled "Coming in 0.2" | ✅ collapses to ~48 px icon-rail | ❌ stays disabled |
| `[←][→]` history nav | ❌ Disabled "Coming in 0.2" | ✅ recent workspaces stack | ❌ stays disabled |

### 1.8 Center panel — current vs Conductor

| Element | Current | Conductor | Plan 09 |
|---|---|---|---|
| Empty state | `<app-empty-center>` card | breadcrumb tabs ("Quickstart > 1-start-here") + chat thread | replace with `ChatPanelComponent` when a workspace is selected; keep card when none |
| Chat thread | ❌ none | assistant + user message bubbles, `INTERRUPTED BY USER` markers, `API Error` banners with `Retry` / `Retry in new chat` ghost CTAs | streaming text accumulator + prompt input + stop button (no bubbles, no styling pass) |
| Composer | ❌ none | textarea + `[Sonnet 4.6 ∨]` model picker + `[Effort ─]` (disabled) + `[@]` mention + `[📎]` attachments + Send `↑` | basic textarea + Send button; model picker / effort / @ / 📎 deferred |
| Tabs per workspace | ❌ none | multiple chats per workspace ("1 Start here / Untitled") — F2 deferred | ❌ Not added |
| Token-count / context indicator | ❌ none | `⌘L to focus` hint + token counter on the right of composer | ❌ Not added |
| Workspace tab strip at top | ❌ none | "Quickstart > 1-start-here" breadcrumb | ❌ Not added |
| Branch indicator in top bar | ❌ none (only on workspace-item subtitle) | `↗ copenhagen` badge with branch glyph | ❌ Not added — see new task ND8 below |
| Status pill (e.g. "PR review required") | ❌ none | top-right of top bar | ❌ Not added; depends on F1+F4 |

### 1.9 Right panel — current vs Conductor

| Element | Current | Conductor | Plan 09 |
|---|---|---|---|
| Tabs | ❌ none (placeholder card) | `All files (disabled v0.2)` / `Changes N` (default) / `Checks (disabled v0.2)` | ❌ none — hides the panel by default (`rightPanelOpen=false`) |
| File tree | ❌ none | full workspace tree | ❌ deferred to plan 10+ |
| Diff list | ❌ none | per-file with +/- counts | ❌ deferred to plan 10 |
| Terminal section | ❌ none | bottom half: `Setup` / `Run` / `Terminal ●` tabs + `[+]` new tab + `[▶ Run ⌘R]` button + xterm.js scrollback | ❌ deferred to plan 10 (PTY infrastructure absent) |
| Resize divider | ❌ none | 4 px tall, 8 px hit area | ❌ deferred |

### 1.10 Keyboard / shortcut coverage

| Shortcut (DESIGN.md D7) | Status |
|---|---|
| `↵` / `⌘↵` Send | ❌ no composer to fire from |
| `⌘.` Stop running agent | ❌ no stop pathway |
| `⌘⌫` Discard changes | ❌ no UI |
| `⌘N` New workspace | ❌ no dialog |
| `⌘R` Add repository | ❌ no dialog |
| `⌘,` Settings | ❌ Settings hidden/removed |
| `⌘[ / ⌘]` Prev/Next workspace | ❌ not wired |
| `Esc` Dismiss dialog | n/a |
| Infrastructure (`ShortcutService` + `[mzShortcut]`) | ✅ present and tested | `services/shortcut.service.ts` |

Plan 09 does NOT wire any of these into the new dialogs / composer / stop button. Adding them is cheap (the registry exists) and unlocks the keyboard-first feel called out in DESIGN.md and in Conductor improvements (`docs/competitors/conductor/improvements.md` § "Keyboard-first / terminal-like controls").

### 1.11 Theme tokens drift

`DESIGN.md` color tokens (`--bg-app`, `--bg-sidebar`, `--bg-center`, `--bg-card`, `--bg-hover`, `--bg-selected`, `--bg-composer`, `--border`, `--border-focus`, …) are not all defined in `libs/shared-styles-theme/`. Components fall back to `hsl(var(--background))` / `hsl(var(--card))` from the Spartan zinc theme, with sporadic direct refs to `var(--bg-hover)` / `var(--bg-center)`. **No new task here** — plan 09 doesn't fix it; flagging it as an open question (Q5) for the next polish pass.

---

## 2. Tâches d'implémentation (priorisées et numérotées)

Notation: `S1.8b.x` = task atom from existing plan 09; `ND-#` = newly discovered tasks; `[APPROFONDI]` flags an existing plan 09 task that needs additional detail surfaced by this audit.

### Priority 1 — Critical (blocking the "you can use Mozart" claim)

#### S1.8b.1 — Window + custom titlebar [APPROFONDI]

Original plan 09 covers tauri.conf.json (1400×900, decorations:false, identifier rename), capabilities/default.json (add core:window:allow-close/-minimize/-toggle-maximize/-is-maximized), TopBar drag region + buttons via `getCurrentWindow()`.

**New details from audit (post-décisions):**
- **Q1 verrouillé** — Settings + About sont **supprimés** du TopBar (pas tooltipés disabled). Image Conductor = source of truth.
- Identifier change moves the DB from `~/.local/share/com.tauri.dev/mozart.db` → `~/.local/share/build.mozart.desktop/mozart.db`. The existing DB will appear "lost" to anyone with current dev state. Document a one-line `mv` instruction in the atom's manual-test note OR run a one-time DB migration helper at app startup that copies the old path forward.
- **Q7 verrouillé** — `decorations: false` cross-platform pour 1.8b. macOS `titleBarStyle: "Overlay"` + `hiddenTitle: true` reportés à 1.8c (polish séparé).

#### S1.8b.2 — `ShellStore` (TDD)

Plan 09 spec is sufficient. Confirmed: `shell.store.ts` must NOT duplicate `WorkspaceStore.selectedWorkspaceId()`; derive via `withComputed` reading `inject(WorkspaceStore)`.

#### S1.8b.3 — Sidebar visual redesign [APPROFONDI]

Plan 09 covers width 260px, flatten project header, drop archive slot from workspace item.

**New details from audit:**
- DESIGN.md L177 says workspace items show "diff counts right-aligned". Currently the workspace pill has *no* +/- counts. The DB row already carries `files_added / files_modified / files_deleted` (`workspace_changes` table) but no front-end query surfaces it. **Decision:** add the counts as new task ND4 (P2), not folded here — plan 09 is mid-flight and adding it now widens scope. Flag the visual diff (Conductor shows counts; we won't yet) in the manual-test note.
- The right-click context menu (DESIGN.md L178-190) stays out per current code — `workspace-item.component.ts` already intercepts `contextmenu` to suppress the browser default so plan 11 can wire the menu. Don't re-enable the browser menu in 1.8b.
- Header row `[+] [⚙]` opacity transition (currently hover-only at 0.15s) stays; only enable the `+` New Workspace, keep `⚙` disabled with "Coming in 1.8d" tooltip per DESIGN.md Rule 7.

#### S1.8b.4 — Agent streaming [APPROFONDI]

Plan 09 covers `agent-channel.util.ts` (channelToObservable helper), `bindings.service.ts` exposing `startAgentRun` + `stopAgentRun`, `chat-panel.component.ts` with tokens accumulator + stop button.

**New details from audit (post-décisions):**
- **Q2 verrouillé — pas de polling.** Remplacer le bloc poller `interval(1500).pipe(...listRuns...)` du plan 09 par un event `tauri-specta` typé `AgentRunTerminated { run_id, status }`:
  - **Rust:** déclarer l'event via `tauri_specta::Event` macro; émettre depuis `claude_cli/runner.rs` supervisor task juste après `agent_runs::mark_ended` (ligne ~381). Inclure dans `specta_builder.events(collect_events![…])` à côté de `setup_builder.mount_events(app)` qui est déjà appelé `lib.rs:130`.
  - **Front:** `AgentRunTerminated.listen(cb)` filtré par `run_id`, qui appelle `complete()` sur la subject. Le `done$` subject du plan 09 disparaît.
  - **Impact:** ~30 lignes Rust nouvelles + 1 declaration d'event + suppression du poller front. Zéro DB load, zéro lag.
- Channel cleanup: `tauri::ipc::Channel<T>` does not surface a completion event when the supervisor exits. The current Rust code does NOT close the channel; it just stops sending. The `complete()` idempotent guard in plan 09's util is therefore *required*, not optional — verify the implementer keeps it. Avec l'event Q2, `complete()` est appelé depuis le listener `AgentRunTerminated`.
- Stop button wiring: Plan 09 lets `stop` resolve `run$` first (`await run$`) before calling `stopAgentRun(run.run_id)`. If the user mashes stop before `start_agent_run_impl` returns, we hold the user under an indeterminate spinner. **Mitigation:** during the "waiting on run$" window, the stop button should remain enabled and the click should be queued (set `stopRequested.set(true)`; `start_agent_run`'s `.then` checks the flag and stops immediately). Document this in the chat-panel spec.
- Wire `⌘.` / `Ctrl+.` to `stop()` in `ChatPanelComponent` via `ShortcutService.register$`. Wire `Enter` to send and `⌘↵` to send-and-clear. Add to atom acceptance.
- `errorMsg` UX: when the StreamEvent variant is `error`, also surface a `[Retry]` ghost button that re-runs the same prompt (matches Conductor's "Retry / Retry in new chat" pattern minus the second option). New task ND5 captures the full error-banner shape; plan 09 atom keeps the bare `errorMsg` signal.

#### S1.8b.5 — Add Repo + Create Workspace dialogs [APPROFONDI]

Plan 09 covers `add-repo-dialog.component.ts` + `create-workspace-dialog.component.ts` (hlm-dialog), `project.store.ts::addRepo(path)`, `workspace.store.ts::createWorkspace(repoId, baseBranch, taskText)`, sidebar wiring.

**New details from audit (post-décisions):**
- **Q4 verrouillé** — text-input-only pour le path absolu; bouton `[Browse…]` présent mais `disabled` avec tooltip "Coming in 1.8c". Pas d'install de `tauri-plugin-dialog`.
- `listBranches` est wired dans `BindingsService.listBranches` mais jamais appelé. `CreateWorkspaceDialog` doit l'appeler à l'ouverture du dialog pour peupler le select. Inline error "no branches found" si vide (proxy pour detached-HEAD; le case typé arrive en 1.8c via Q3).
- Use `--bg-card`, `--border-focus`, `--radius-md` (24 px padding, 480 px width, click-to-dismiss disabled — must use Cancel/Esc). Plan 09 just says "standard spartan dialog pattern" — call this out in the implementer brief.
- **Q5 verrouillé** — `Cancel|Primary` partout (3 OS), pas de `platform.service.ts`. Spartan Dialog footer en ordre fixe.
- **Q3 verrouillé — 1.8c.** `AddRepoDialog` ship avec message générique `MozartError.message` sur validation error (pas de switch par case typée).
- Wire `⌘N` to `CreateWorkspaceDialog.open()` and `⌘R` to `AddRepoDialog.open()` via `ShortcutService`. Add to atom acceptance.

### Priority 2 — UI delta vs Conductor (worth doing in 1.8b but not blocking)

#### ND1 — Branch / status indicator on top bar (P2)

Conductor displays `↗ <branch>` + `<PR-status-pill>` in the top-bar right area when a workspace is active. Mozart's top bar is bare. Add a `<workspace-context-strip>` between the brand and the window controls that, when `ShellStore.activeWorkspaceId()` is set, shows the workspace's `branch_name` in mono font (matches the only place that token is allowed to surface — pill subtitle). Skip the PR-status pill until F4 (Merge Decision entity).

Files: `top-bar.component.ts` + new `workspace-context-strip.component.ts`.

#### ND6 — Sidebar dev-tools panel for SQLite (P2 → P3)

Behind `isDevMode()` only, add a collapsible "DB" section under the sidebar that lists row counts per table (repos / tasks / workspaces / threads / agent_runs / agent_events / workspace_changes / outbox) by adding one new Rust command `dev_db_stats()` returning `Vec<(String, i64)>`. Cheap, useful, dev-only. Skip if it widens 1.8b scope beyond comfort.

Files: new `apps/desktop/src-tauri/src/commands/dev.rs` + `bindings.service.ts` + new `apps/desktop/src/app/dev/db-stats-panel.component.ts`.

### Priority 3 — Quality of the streaming/abort experience (P2)

#### ND5 — Streaming error banner with Retry (P2)

When `StreamEvent::Error` lands during a run, render an inline banner in the chat panel using `--accent-error-bg` / `--accent-error-br` (DESIGN.md error-banner token), 13 px mono message text, ghost `[Retry]` button that re-fires `startAgentRun(workspaceId, lastPrompt)`. Auto-dismiss off (errors require ack per DESIGN.md error-state rules).

Files: `chat-panel.component.ts`.

#### ND7 — `⌘.` global stop binding (P2)

Already specified as part of S1.8b.4 [APPROFONDI]. Calling it out separately so the atom acceptance test is unambiguous.

#### ND8 — Typed RepoIssue → front-end inline copy (P3, after 1.8b)

Rust currently flattens `RepoIssue { NestedRepo, Submodules, NonGit, DetachedHEAD, LfsWarn, … }` to `AppError::Validation(String)`. AddRepoDialog can't render the per-case copy required by DESIGN.md state matrix. Fix by adding a new `AppError` variant `Validation(RepoIssue)` or, less invasively, a new typed kind `RepoIssue { kind, message }` next to the existing six (`Db / Io / NotFound / Validation / AgentSpawn / GitCmd`). Regenerate `_bindings.ts`.

Files: `error.rs`, `commands/mod.rs::add_repo_impl`, `bindings.schemas.ts`, `add-repo-dialog.component.ts`. **Out of scope for 1.8b — capture as a Step 1.8c ticket.**

### Priority 4 — UI delta vs Conductor (deferred to plans 10/11)

| Tag | Item | Defer to |
|---|---|---|
| ND9 | Right-panel `Changes` tab + per-file diff list | plan 10 |
| ND10 | Terminal panel (xterm.js + PTY) | plan 10 |
| ND11 | `All files` file-tree tab | plan 11 |
| ND12 | Workspace context menu (mark unread, pin, status, archive) | plan 11 |
| ND13 | Multiple chats per workspace (tabs) | F2 (post-v0.0.1) |
| ND14 | Composer model picker / effort / @-mention / attachments | plans 10/11 |
| ND15 | Workspace pill diff counts (+X −Y right-aligned) | plan 10 (depends on `getWorkspaceDiff` polling) |
| ND2 | Native folder picker (`tauri-plugin-dialog`) | 1.8c |
| ND3 | `platform.service.ts` + adaptive dialog button order | 1.8c |

---

## 3. Updated task summary (numbered, top-to-bottom delivery order)

| # | Atom | New / Existing | Priority |
|---|---|---|---|
| 1 | S1.8b.1 — Window + custom titlebar (1400×900, `decorations: false` cross-OS, identifier rename, **supprime Settings + About**, DB-path migration note) | [APPROFONDI] | P1 |
| 2 | S1.8b.2 — `ShellStore` (TDD) | existing | P1 |
| 3 | S1.8b.3 — Sidebar visual redesign (260 px, drop archive slot, flatten project header, enable `+ New workspace`) | [APPROFONDI] | P1 |
| 4 | S1.8b.4 — Agent streaming (**tauri-specta event `AgentRunTerminated` Rust→front, pas de poller**; stop-while-pending guard; `complete()` guard; keyboard `⌘.` / `Enter` / `⌘↵`) | [APPROFONDI] | P1 |
| 5 | S1.8b.5 — Add Repo + Create Workspace dialogs (text-only path input + `[Browse…]` disabled + `listBranches` wiring + `Cancel\|Primary` ordre fixe + `⌘N` / `⌘R` shortcuts) | [APPROFONDI] | P1 |
| 6 | ND1 — Top-bar workspace-context-strip (branch indicator only) | NEW | P2 |
| 7 | ND5 — Streaming error banner with Retry | NEW | P2 |
| 8 | ND6 — Dev-only DB stats panel | NEW (optional in 1.8b) | P2/P3 |
| 9 | ND8 — Typed RepoIssue → front-end inline copy | NEW | P3 (defer to 1.8c) |
| 10 | ND15 — Workspace pill diff counts | NEW | P3 (plan 10) |
| 11 | ND9–ND14, ND2, ND3 — see Priority 4 table | NEW | deferred |

**Recommendation:** atoms 1–5 stay the spine of 1.8b exactly as plan 09 sequenced them; atoms 6–8 (P2) can be folded into the same milestone if scope permits or deferred to 1.8c with no rework. Atoms 9–11 belong to later plans.

---

## 4. Validation gate additions (on top of plan 09 § 9)

```sh
# Already in plan 09
pnpm nx lint desktop
pnpm nx typecheck
pnpm nx test desktop
pnpm nx build desktop

# New gates from this audit
# 4a. Every Tauri command in commands/mod.rs MUST have a wrapper in bindings.service.ts
diff <(grep -oE 'pub async fn ([a-z_]+)\(' apps/desktop/src-tauri/src/commands/mod.rs | sed 's/pub async fn //; s/_impl//; s/(//' | sort -u) \
     <(grep -oE '^\s+[a-zA-Z]+ = ' apps/desktop/src/app/services/bindings.service.ts | tr -d ' =' | sort -u)
# 4b. No forbidden user-visible strings in shell/sidebar component templates
! grep -rEn 'worktree|branch_name|base_branch|detached HEAD|HEAD~1|agent/wip-' \
    apps/desktop/src/app/shell apps/desktop/src/app/sidebar --include='*.ts' \
    | grep -v 'workspace().branch_name'  # branch_name is allowed ONLY in workspace-item subtitle
# 4c. No raw `subscribe()` without takeUntilDestroyed in new chat-panel + dialogs
! grep -rEn '\.subscribe\(' apps/desktop/src/app/shell apps/desktop/src/app/sidebar --include='*.ts' \
    | grep -v 'takeUntilDestroyed\|takeUntil\|takeWhile\|withLatestFrom'
```

Manual smoke (extends plan 09):
1. `pnpm dev` → window 1400×900, no native titlebar, traffic-light-equivalent custom buttons work.
2. Add repo via `⌘R` → sidebar shows project.
3. `⌘N` → CreateWorkspaceDialog opens; branch select populated from `listBranches`.
4. Click workspace → `ChatPanelComponent` opens in center.
5. Type prompt + Enter → stream appears token by token.
6. `⌘.` mid-run → channel completes, status flips, no leak.
7. Force a Claude error (set MOZART_CLAUDE_BIN to a script that prints to stderr and exits 1) → error banner shows with `[Retry]` ghost (if ND5 included).
8. Close + reopen app → selected workspace persisted; project expansion state persisted.

---

## 5. Décisions verrouillées (résumé exécutable)

Q1–Q8 toutes tranchées en haut du document. Plus de questions ouvertes pour 1.8b.

Tickets follow-up séparés à créer pour 1.8c:
- **1.8c-T1** — Tauri-specta event `AgentRunTerminated` (refactor que Q2 a fait disparaître; en réalité Q2 est résolu dans 1.8b — donc ce ticket est NULL si on l'implémente dans S1.8b.4. À vérifier au moment de l'atomisation.)
- **1.8c-T2** — `tauri-plugin-dialog` + folder picker `[Browse…]` actif.
- **1.8c-T3** — `RepoIssue` typé propagé au front via nouvelle variante `AppError`.
- **1.8c-T4** — `platform.service.ts` + ordre des boutons adaptatif macOS vs Win/Linux (si demandé par DESIGN.md polish pass).
- **1.8c-T5** — macOS `titleBarStyle: "Overlay"` + `hiddenTitle: true` pour préserver les traffic lights.

---

## 6. Confidence

**8/10** — Same confidence band as plan 09. The audit confirms plan 09's structural decisions are sound; the new findings are scope-clarifications and follow-ups, not blockers. Highest residual risks: (a) channel cleanup semantics under fast abort+restart cycles, (b) DESIGN.md drift if Settings/About are removed prematurely (Q1), (c) zero front-end coverage of `discardWorkspaceChanges` even though Rust + `BindingsService` are ready — flag for the user that "Discard" is invisible until plan 10.
