# Shell UX Investigation & Implementation RFC

**Status:** Draft
**Created:** 2026-05-24
**Scope:** Workspace shell — right sidebar (PR workflow, Changes, file
tree, processes), middle shell (file tabs, header, composer, preview,
save/discard), diff UX (`MzFileDiffCard`).
**Out of scope:** new multi-file review view (only the seam is
prepared), full kanban automation, GitHub PR sync after the PR is
opened.

---

## TL;DR

User-explicit priorities → critical: **file changes, PR workflow,
general shell UX.** File-header refactor bundles into P1 as the seam
for the future multi-file review surface.

| ID   | Area          | Item                                                                                         | Priority | Status     |
| ---- | ------------- | -------------------------------------------------------------------------------------------- | -------- | ---------- |
| P1.1 | Right sidebar | PR workflow rewire (Create PR primary, Merge now "Soon", GitHub gate, status transitions)    | **P1**   | ✅ DONE    |
| P1.2 | Right sidebar | Changes tab persistence (cross-reload hydration, watcher coverage audit, rename handling)    | **P1**   | ✅ DONE    |
| P1.3 | Middle shell  | File tabs (close button, preview/pin tabs, double-click in tree, save→Changes sync)          | **P1**   | pending    |
| P1.4 | Middle shell  | File header refactor (drop `FeatureFileToolbar`, reuse `MzFileDiffCard` with `flush` chrome) | **P1**   | pending    |
| P2.1 | Right sidebar | File tree real loading state (tree-shaped skeleton, min-delay anti-flicker)                  | P2       | ✅ DONE    |
| P2.2 | Middle shell  | Composer visibility on file tabs                                                             | P2       | ✅ DONE    |
| P2.3 | Middle shell  | Save/Discard overlay (absolute, shadow, no layout push)                                      | P2       | pending    |
| P2.4 | Diff UX       | Human-readable hunk labels (`@@ -120,7 @@` → `"120 lines above"`)                            | P2       | ✅ DONE    |
| P2.5 | Diff UX       | Better expand-context button (wide strip vs 12px chevron)                                    | P2       | ✅ DONE    |
| P2.6 | Right sidebar | Setup/Run tab UX (empty-state CTA, behavior audit)                                           | P2       | pending    |
| P2.7 | Right sidebar | Terminal first-load visual (xterm mount window)                                              | P2       | pending    |
| P3.1 | Middle shell  | Preview mode default + scope decision (markdown only)                                        | P3       | pending    |

Each P1 item is sized for one PR slice. P2 items are independent
polish PRs. P3.1 is a one-liner now + a planning round later.

---

## 1. Investigation map

What each surface looks like today. No proposals here; current state
only.

### 1.1 Right sidebar — composition

`ShellRight` (`libs/desktop-shell-feature/src/lib/shell-right.ts:33–87`)
houses the right pane. Visibility gated on
`workspaces.activeId() !== null && layout.rightPanelOpen()` (lines
100–102). Header row contains the merge-action menu (only when a
workspace is active) and non-mac window controls; below it,
`FeatureWorkspaceAside` mounts the All/Changes top half and the
Setup/Run/Terminal bottom half.

`FeatureWorkspaceAside`
(`libs/desktop-workspaces-feature/src/lib/feature-workspace-aside.ts:1–19`)
is a pure stack of `FeatureWorkspaceFiles` over
`FeatureWorkspaceProcesses`.

### 1.2 Right sidebar — PR workflow (current state)

- Split-button + dropdown:
  `libs/desktop-workspaces-ui/src/lib/merge-action-menu.ts:47–144`.
- Primary action routes:
  `workspace.lastMergeAction` → `project.mergeMode` → `'pr'`
  (`libs/desktop-shell-feature/src/lib/shell-right.ts:112–120`).
- Primary disabled when action is `'pr'` AND
  `!githubConnected()` (lines 115–117 of merge-action-menu).
- Dropdown always shows both rows — Create PR is disabled with a
  "Connect GitHub to open PRs" tooltip when disconnected (lines
  79–101 of merge-action-menu).
- Click handler:
  `ShellRight.onMergeActionPick` (lines 133–146 of shell-right.ts)
  persists `lastMergeAction` and routes to either
  `openCreatePrDialog` or `runLocalMerge`.
- Dialog: `FeatureCreatePrDialog`
  (`libs/desktop-repositories-feature/src/lib/feature-create-pr-dialog.ts`)
  — title/body/draft form, calls
  `commands.createWorkspacePr()` and surfaces the PR URL.
- Rust side:
  - `apps/desktop-tauri/src/commands/mod.rs:2310–2336` —
    `push_workspace_branch`.
  - `apps/desktop-tauri/src/commands/mod.rs:2343–2384` —
    `create_workspace_pr`.
  - `apps/desktop-tauri/src/github.rs:1–152` —
    token probe, `parse_github_remote`, `create_pr` via
    `POST /repos/{owner}/{repo}/pulls`.
  - `apps/desktop-tauri/src/commands/mod.rs:2386–2404` —
    `merge_workspace_locally` (the only path that flips
    `workspace.ui_status` today, on `'done'` or `'conflict'`).
- Connection state: `ProfileFacade.githubConnected()`
  (`libs/desktop-profile-data-access/src/lib/profile.facade.ts:89–96`);
  bootstrapped by `initializeGithub()` (lines 102–111). Token in
  `CREDENTIALS_ADAPTER`.
- Workspace status model:
  `libs/desktop-workspaces-util/src/lib/workspace-status.ts:6–11`
  defines `'backlog' | 'in_progress' | 'in_review' | 'done' |
'canceled'`. `isFrozen` covers `'done' | 'canceled'`.
- Workspace store: `WorkspaceStore.setStatus(workspaceId, status)`
  (`libs/desktop-workspaces-data-access/src/lib/workspace.store.ts`)
  is the entry point; today only the local-merge path calls it.

**What's missing right now:** (a) Merge now's primary slot is still
reachable when the route resolves to `'local'`; (b) no "Soon"
treatment on the local row; (c) status transitions on commit/PR/done
are implicit/manual; (d) the dialog doesn't react to a `githubConnected
→ false` flip mid-flow.

### 1.3 Right sidebar — Changes tab (current state)

- Container:
  `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-workspace-files.ts:47–341`.
  Owns: FS watcher, agent-run auto-route, tabbed All / Changes header.
- Tab state persisted per-workspace via
  `UiStateFacade.asideStateFor()` →
  `WorkspaceAsideState { filesView, stagedOpen, unstagedOpen,
bottomTab }` (`libs/desktop-ui-state-data-access/src/lib/ui-state.store.ts`).
  Survives navigation and tab switches.
- Changes-list body:
  `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-changes-list.ts:37–320`.
  Splits cached files into `stagedFiles` + `unstagedFiles`.
- Cache:
  `RepositoriesFacade.cachedChangedFilesFor(workspaceId)` reads
  `FileTreeCache` (in-memory NgRx signal store, revision-tracked).
- Fetch flow:
  - Initial: effect at `feature-workspace-files.ts:196–214` —
    cache miss → `listChangedFiles` → `cacheChangedFiles` with
    captured revision (race-safe against watcher events).
  - FS watcher tick: `attachWatcher` (lines 293–329) →
    `refreshChangedFilesInBackground` (soft refresh, keeps old
    list on screen, writes new one atomically).
- Tauri side:
  `apps/desktop-tauri/src/commit.rs:list_changed_files` —
  `git status --porcelain=v1 -z`, then `git diff HEAD --numstat`
  overlay for added/removed counts, then `git diff --diff-filter=U`
  for conflicts.
- `ChangedFile` type
  (`libs/desktop-repositories-data-access/src/lib/repositories.adapter.ts:132–138`):
  `{ path, status: 'added'|'modified'|'deleted', staged: boolean,
added: number, removed: number }`. **No `oldPath` and no `'renamed'`
  status.**
- Row click:
  `feature-changes-list.ts:304–319` → `openFileFromChanges` →
  `uiState.openWorkspaceFile(id, path, { mode: 'diff', source:
'changes' })`. ✓
- Per-row mutations (stage / unstage / discard) exist as protected
  methods (lines 242–289) but are not currently bound from the
  template — context menu wiring is a future polish.

**What's missing:** the cache is in-memory only, so a real **app
reload** (not a tab switch) resets to empty until the first
`listChangedFiles` completes. No `'renamed'` status flowing through —
git reports rename as `deleted + added`, both rows show up
separately.

### 1.4 Right sidebar — file tree (current state)

- Component:
  `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts:43–98`.
- Loading tiers (lines 124–182):
  1. Own cache (`cachedTreeFor`) — fresh entry → paint instantly.
  2. Sibling cache (`projectFallbackTreeFor`) — freshest tree from
     any sibling workspace of the same project. Branches share ~99%
     of files, so the eye reads "approximately correct, refreshing".
  3. Local fetched tree (`linkedSignal` that resets to `[]` on
     workspace switch).
  4. Skeleton — only when all three are empty AND `loading` is
     true.
- Current skeleton:
  `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.ts:1–28`
  — 7 hardcoded shimmer rows (widths 78/52/88/34/64/92/46%). Anti-
  jitter design, but generic.
- Expansion: tree-expanded paths persisted via
  `UiStateFacade.treeExpandedFor(workspaceId)`.
- Click → `(fileSelected)` output → `feature-workspace-files.ts:271–291`
  → `openFileFromAllFiles` → `uiState.openWorkspaceFile(id, path,
{ mode: 'edit', source: 'all-files' })`. ✓
- **No double-click handler today.** No
  `(fileDoubleClick)` output exists on `FileTreeRow` /
  `FeatureFileTree`.

### 1.5 Right sidebar — Setup / Run / Terminal (current state)

- Container:
  `libs/desktop-workspaces-feature/src/lib/feature-workspace-processes/feature-workspace-processes.ts:41–242`.
  `hlm-tabs` with three triggers; bottom tab persisted per workspace
  via `asideState.bottomTab`. Default `'run'`.
- URL hint (`?tab=setup`) consumed once at first activation (lines
  185–204).
- Setup body:
  `libs/desktop-workspaces-feature/src/lib/feature-workspace-processes/feature-workspace-setup.ts:79–87`
  — empty-state card; disabled until `project.runCommand` exists.
  Clicking calls `RunRegistry.start(workspaceId)`.
- Run body:
  `FeatureWorkspaceRun` (in `desktop-runs-feature`) — kept mounted
  across tab switches so output survives.
  `active` input controls auto-focus / pause.
- Terminal body:
  `FeatureWorkspaceTerminal` (in `desktop-terminals-feature`) —
  lazy-mounted via `hlmTabsContentLazy` (lines 131–138). First
  activation pays xterm construction cost. **This is the source of
  the first-load visual claim.**
- Run/Stop split-button at the tab strip's right end
  (`RunActionMenu`, lines 100–107).
- Auto-route to Run on start:
  `onStartRun` flips `bottomTab` to `'run'` if not already there
  (lines 217–230).

### 1.6 Middle shell — composition

- `app-shell.ts:40–46` lays out left / `<main>` / right.
- Workspace detail page renders the chat tab bar + the active tab's
  content via `WorkspaceTabContent`
  (`libs/desktop-workspaces-feature/src/lib/workspace-tab-content.ts:35–86`).
  `@switch (tab()?.kind)`:
  - `'chat'` → `FeatureWorkspaceMiddle` + `FeatureChatContent`.
  - `'file'` → `FeatureFileContent`.
- Tab bar:
  `libs/desktop-workspaces-feature/src/lib/feature-chat-tab-bar.ts:44–172`
  composes the merged list of chat tabs + file tabs and feeds it to
  `WorkspaceTabBar`. Close handler dispatches:
  `parsed.kind === 'file'` → `fileTabs.closeFor(ws, parsed.path)`;
  `parsed.kind === 'chat'` → `facade.closeChat(parsed.chatId)`.

### 1.7 Middle shell — file tabs (current state)

- `WorkspaceTabBar`
  (`libs/desktop-workspaces-ui/src/lib/workspace-tab-bar.ts:53–130`)
  binds each `TabItem` with
  `[showClose]="tab.kind !== 'chat' || chatTabCount() > 1"`. For a
  file tab this resolves to **true** — correct intent.
- `TabItem`
  (`libs/desktop-workspaces-ui/src/lib/tab-item.ts:38–177`)
  template lines 75–106 gate **both** the rename pen AND the close
  `×` inside `@if (tab().kind === 'chat' && !renaming())`. The
  `showClose` input is then checked inside that block. **The
  outer chat-only guard short-circuits before the close `×` ever
  renders for file tabs.** This is the close-button bug.
- Tab state:
  `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.ts:16–103`.
  `openFor` (append + activate, FIFO eviction at
  `FILE_TAB_CAP`), `closeFor` (remove + fall back to neighbor),
  `setActiveFor` (mark active without opening). **The close logic
  itself is wired and tested.**
- File-open routing:
  - From All files (`feature-workspace-files.ts:276–291`):
    `openWorkspaceFile(id, path, { mode: 'edit', source: 'all-files' })`. ✓
  - From Changes (`feature-changes-list.ts:304–319`):
    `openWorkspaceFile(id, path, { mode: 'diff', source: 'changes' })`. ✓
- File tabs are appended without distinction between "preview" and
  "pinned" — VS Code-style preview tab (single click replaces) does
  not exist.

### 1.8 Middle shell — file content + legacy header (current state)

- `FeatureFileContent`
  (`libs/desktop-workspaces-feature/src/lib/feature-file-content.ts:67–225`)
  is an `<hlm-tabs>` with `edit` and `diff` panels:
  - Header (lines 73–83): renders `FeatureFileToolbar`.
  - Save/Discard row (lines 85–117): 8px inline strip with Save +
    Discard buttons, layout-pushing.
  - Edit panel (lines 119–216): `<mz-code-editor>` lazily loaded.
  - Diff panel (lines 218–224): `<app-feature-file-diff>`.
- Mode state lives in
  `UiStateFacade.fileViewStateFor(workspaceId)` —
  `WorkspaceFileViewState` (per
  `libs/desktop-ui-state-util/src/lib/ui-state.types.ts:59–73`)
  has `edit` and `review` sub-flows plus `activeFlow`. Default mode
  per active flow: edit=`'edit'`, review=`'diff'`.
- Legacy header:
  `libs/desktop-repositories-feature/src/lib/feature-file-toolbar.ts:62–262`
  — filename badge + Viewed toggle + (optional) Discard +
  Unified/Split tabs + Diff/Edit tabs. The Unified/Split control is
  duplicative of `MzFileDiffCard`'s own card chrome. This is the
  refactor target.
- Diff body:
  `libs/desktop-repositories-feature/src/lib/feature-file-diff.ts:46–134`
  is a smart wrapper around `MzFileDiffCard` (for code) and
  `MzMessageMarkdown` (for markdown). Defaults to **Preview** for
  `.md/.mdx/.markdown` per the `linkedSignal` at lines 161–163.
- Save flow (`feature-file-content.ts:463–484`): `repos.saveFile` →
  baseline + hash updated. **No explicit
  `softRefreshAfterMutation` call after save.** The FS watcher
  catches the on-disk write and runs the refresh path on its
  debounce window, but a user save in a file tab does NOT
  immediately re-prime the Changes list (a perceptible lag of ~250ms+).

### 1.9 Middle shell — composer (current state)

- `MzComposer`
  (`libs/mozart-ui/composer/src/lib/mz-composer.ts:49–100+`).
  Mode toggle, effort level, model selector, send button, stop
  button, scroll-to-bottom overlay.
- Mount site: `FeatureWorkspaceMiddle`
  (`libs/desktop-workspaces-feature/src/lib/feature-workspace-middle.ts:42–88`)
  wraps chat content and mounts composer at line 65 with
  `sticky bottom-0 z-20`. **This component only mounts in the
  chat `@case`** of `WorkspaceTabContent`. File tabs never see it.
- Recent change (commit `5646598`): tooltip data dropped, mode
  icon bumped to `sm`. No visibility-related changes.

### 1.10 Diff UX — `MzFileDiffCard` (current state)

- Component:
  `libs/mozart-ui/file-diff-card/src/lib/mz-file-diff-card.ts:84–480`.
- Inputs: `path`, `oldPath`, `status` (`FileDiffStatus`),
  `additions`, `deletions`, `diffText`, `loading`, `error`,
  `fetchContext` (callback), `fileLineCount`, `defaultCollapsed`,
  `active`, `viewed`.
- Outputs: `refresh`, `pathCopy`, `copyError`, `showAnyway`,
  `toggleCollapsed`, `viewedChange`.
- Status union (line 33):
  `'modified' | 'added' | 'deleted' | 'renamed' | 'binary' |
'too-large' | 'no-diff'` — `'renamed'` is supported, plus
  `oldPath` for the from→to render.
- Card header (lines 118–256): collapse chevron, path display, copy
  path, expand-all, diff stats, status badge, refresh, Viewed
  toggle. **The chrome is always there — no `flush` variant.**
- Diff body (lines 258–310): `<mz-diff-view>` for `'diff'` mode;
  placeholder text for `binary` / `too-large` / `no-diff`.
- Always-card chrome means embedding inside a file tab today
  produces a nested card-in-frame look.

### 1.11 Diff UX — hunk display (current state)

- Parser:
  `libs/mozart-ui/diff-parser/src/lib/diff-parser.ts:20–162`.
  `DiffHunk` has `{ header, startLine, endLine, oldStart, oldCount,
newStart, newCount, addedLines, removedLines }`. Already typed
  with the parsed counts. ✓
- Renderer:
  `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:131–140`
  appends `item.text` (the raw `@@ -120,7 +120,8 @@` string)
  verbatim as a doc line with `kind: 'hunk'` line meta. The hunk
  row gets a `mz-diff-cm-hunk-row` class with `--diff-hunk-bg`.
- Hunk gutter button:
  `cm-diff-extensions.ts:478–532` — 12px chevron at the seam
  between old/new line-number gutters; expands 20 lines (or 40 with
  shift-click). One direction only ('up'). Title attr says
  "Show 20 lines above".
- Trailing-gap expand bar:
  `cm-diff-extensions.ts:269–334` — full-width strip, three
  buttons (up/down/both), label `"{N} hidden lines"`. **Already
  visually parseable; the hunk-row button is the one that needs
  upgrading.**

---

## 2. Implementation plan

Each item has: **goal**, **current → target**, **files to touch**,
**verification**.

### 2.1 P1.1 — PR workflow rewire ✅ DONE

**Goal:** Right-aside header always advertises "Create PR" as the
primary action; "Merge now" temporarily disabled with a "Soon"
treatment; PR creation gated on GitHub connection; workspace status
flips through the lifecycle.

**Current → target:**

|                               | Current                                    | Target                                                                           |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Primary action                | `lastMergeAction \|\| mergeMode \|\| 'pr'` | Hard-coded `'pr'`                                                                |
| Merge now (dropdown)          | Enabled                                    | Disabled with `Soon` badge + tooltip                                             |
| GitHub gate                   | Tooltip in disabled state ✓                | + inline alert in dialog if connection flips mid-flow                            |
| `lastMergeAction` persistence | Persisted on every click                   | Only `'pr'` is reachable; legacy field stays untouched                           |
| Status transitions            | Local merge → `'done'` only                | + commit → `'in_progress'` (if `'backlog'`); + PR create success → `'in_review'` |

**Files to touch:**

- `libs/desktop-workspaces-ui/src/lib/merge-action-menu.ts:47–144`
  — drop the `primaryAction` input dependency (always `'pr'`), add
  a `localMergeDisabled` input (default `true` for now), append the
  `Soon` badge next to the Merge now row label.
- `libs/desktop-shell-feature/src/lib/shell-right.ts:112–146`
  — collapse `mergePrimaryAction` to a constant; keep
  `onMergeActionPick` so the dropdown path still works once Merge
  now is re-enabled later.
- `libs/desktop-repositories-feature/src/lib/feature-create-pr-dialog.ts`
  — inject `ProfileFacade`, subscribe to `githubConnected()`;
  render an inline `Alert` at the top of the dialog when it flips
  false, with a "Connect GitHub" link to the existing connection
  flow.
- `libs/desktop-workspaces-data-access/src/lib/workspace.facade.ts`
  - `workspace.store.ts` — call `setStatus(id, 'in_progress')`
    after a successful `commitWorkspace` (only if the current status
    is `'backlog'`); call `setStatus(id, 'in_review')` after a
    successful `createWorkspacePr`. Keep the existing
    `merge_workspace_locally` → `'done'` path.
- `apps/desktop-tauri/src/commands/mod.rs:2343–2384` — confirm
  `create_workspace_pr` returns `{ number, html_url }` (it does,
  per `github.rs:60–110`); no Rust change needed unless we move
  the status flip server-side (recommend keeping it in the facade
  for now to avoid two writers).

**Verification:**

1. Open a workspace with GitHub disconnected:
   - Primary button shows `Create PR` with tooltip "Connect GitHub
     to open PRs" and is `disabled`.
   - Dropdown shows Create PR row (disabled, same tooltip) and
     Merge now (disabled with `Soon` badge + tooltip "Coming soon").
2. Connect GitHub:
   - Primary button becomes enabled.
   - Click → dialog opens; PR title prefilled from workspace name.
3. Mid-dialog, run `gh auth logout` (or programmatic flip) →
   inline alert appears; submit button disables.
4. Submit a real PR on a sandbox repo:
   - Toast shows the PR URL.
   - `workspaceById(id).status` flips to `'in_review'` (verify
     via devtools or kanban board).
5. Commit changes in a workspace whose status is `'backlog'`:
   - Status flips to `'in_progress'` (one-time).
6. `merge_workspace_locally` still flips to `'done'`. (Will be
   reachable again once Merge now is re-enabled in a later
   release.)

**Risks / notes:**

- The `lastMergeAction` field becomes dead code while Merge now is
  disabled. Leave it on the type — it'll be useful once the local
  merge is reinstated.
- The dialog's mid-flow disconnect is a rare path. If signal-driven
  re-render is too noisy, fall back to a one-shot check on submit
  instead of a live alert.

---

### 2.2 P1.2 — Changes tab persistence ✅ DONE

**Goal:** Changes list survives **app reload** (not just navigation).
Sync between Git real state and UI is auditable and rename detection
flows through.

**Current → target:**

|                     | Current                                                                                | Target                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Tab switch          | Cache-backed ✓                                                                         | unchanged                                                                |
| App reload          | In-memory cache → empty until first `listChangedFiles`                                 | Hydrate from a persisted last-known snapshot, then refresh in background |
| FS watcher coverage | Stage/unstage/discard/external save all flow through `refreshChangedFilesInBackground` | unchanged; add a manual "refresh" button as escape hatch                 |
| Rename              | `deleted + added` two rows                                                             | Single `'renamed'` row with `oldPath`                                    |

**Files to touch:**

- `libs/desktop-repositories-data-access/src/lib/file-tree-cache.store.ts`
  — add a persisted slice (via `withState` + a custom hook that
  writes to disk through Tauri's `app_handle.store`). Snapshot key:
  `{ workspaceId, revision, files: ChangedFile[] }`. Load on
  workspace activation; treat as "approximate, refreshing" until
  the real fetch lands (same UX as the sibling-tree fallback in
  `feature-file-tree.ts:124–139`).
- `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-workspace-files.ts:196–214`
  — extend the cache-miss effect with the persisted-snapshot read
  before triggering the network round-trip.
- `libs/desktop-repositories-feature/src/lib/feature-workspace-files/feature-changes-list.ts`
  — add a small refresh icon at the right of the
  Staged/Unstaged section header that calls
  `repos.refreshChangedFilesInBackground(workspaceId)` explicitly.
- `apps/desktop-tauri/src/commit.rs:list_changed_files` — switch
  to `git status --porcelain=v2 -z` and parse the `XY` field with
  rename codes (`R100`, etc.). Emit
  `{ status: 'renamed', oldPath, path, staged, added, removed }`
  on rename detection.
- `libs/desktop-repositories-data-access/src/lib/repositories.adapter.ts:132–138`
  — extend `ChangedFile` with `oldPath?: string`. The
  `'renamed'` literal joins the existing union.
- `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-changes-list.ts:227–236`
  — extend `statusLetter()` to return `'R'` for renamed; render
  `oldPath → path` in the row when both are present (use the same
  arrow icon `MzFileDiffCard` uses, lines 143–155 of
  `mz-file-diff-card.ts`).

**Verification:**

1. Make local edits, navigate to another workspace, come back —
   Changes list still shows the prior edits (already works today).
2. Make local edits, quit the app, relaunch — Changes list paints
   instantly with the prior snapshot, then refreshes in place.
3. From the terminal, `git mv old.ts new.ts` — Changes list shows
   one `R` row (`old.ts → new.ts`) instead of two rows.
4. Click the refresh icon — list refreshes without waiting for the
   watcher debounce.
5. External editor saves still show up automatically (the watcher
   path is unchanged).

**Risks / notes:**

- Persisted snapshots can go stale across long shutdowns; flag the
  staleness in the row tint until the refresh completes. The
  sibling-tree pattern already does this for the file tree.
- Rename detection in porcelain v2 is robust but slightly slower on
  big trees. The `--find-renames` overhead is amortized in the
  watcher's debounced calls.

---

### 2.3 P1.3 — File tabs

**Goal:** File tabs can be closed. Single-click in tree opens a
preview tab (italicized, replaces on next single-click); double-click
pins. Saves from inside a file tab immediately refresh the Changes
list.

**Current → target:**

|                                     | Current                                | Target                                                 |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| Close button on file tab            | Hidden by chat-only template guard     | Visible on file tabs (rename stays chat-only)          |
| Open from tree                      | `openFor` (always appends + activates) | `previewFor` on single-click, `pinFor` on double-click |
| Save inside tab → Changes list flip | ~250ms watcher debounce lag            | Immediate (call `softRefreshAfterMutation`)            |
| Diff/Edit mode per source           | Already correct ✓                      | Documented + verified in browser                       |

**Files to touch:**

- `libs/desktop-workspaces-ui/src/lib/tab-item.ts:75–106`
  — split the action group: rename pen stays inside the chat-only
  branch; close `×` moves up one level so it renders for file tabs
  too (still gated on `showClose()` for the chat single-tab guard).
- `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.ts:47–103`
  — add `previewFor(workspaceId, path)`: opens at the **end of
  the list** with a `preview: true` flag; next `previewFor` call
  REPLACES the previous preview tab (one preview per workspace).
  Add `pinFor(workspaceId, path)`: marks the tab `preview: false`.
  `openFor` keeps current behavior (pins by default) — call it
  from `pinFor`.
- `libs/desktop-workspaces-util/src/lib/file-tab.types.ts`
  (or wherever `FileTab` is defined) — add
  `isPreview: boolean` to the `FileTab` interface.
- `libs/desktop-workspaces-ui/src/lib/tab-item.ts:38–73`
  — when `tab.kind === 'file' && tab.isPreview`, render the title
  in italic (Tailwind `italic` class) for the VS Code idiom.
- `libs/desktop-repositories-ui/src/lib/file-tree-row.ts`
  — add a `(fileDoubleClick)` output; debounce: emit
  `fileClick` on the first click only if no second click arrives
  within 250ms.
- `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts:64–95`
  — forward `(fileDoubleClick)` upward.
- `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-workspace-files.ts:271–291`
  — route `(fileSelected)` → `previewFor`, new
  `(fileDoubleClicked)` → `pinFor`.
- `libs/desktop-workspaces-feature/src/lib/feature-file-content.ts:463–484`
  — after a successful `save()`, call
  `repos.refreshChangedFilesInBackground(workspaceId)` +
  `workspaces.refreshDiffStats()` (mirror the post-mutation
  pattern at `feature-changes-list.ts:295–302`).
- `libs/desktop-workspaces-feature/src/lib/feature-chat-tab-bar.ts:91–135`
  — confirm `onClose` for file tabs still routes through
  `fileTabs.closeFor`; nothing to change here, just verify.

**Verification:**

1. Click a file in All files — tab opens with italic title (preview).
2. Click a second file — same preview tab is replaced; no
   accumulation.
3. Double-click a file — tab pins, italic gone, replacement stops.
4. Mouseover any file tab — close `×` appears in the right slot,
   click closes the tab, fallback to neighbor tab works.
5. From Changes, click a file → opens as preview in Diff mode;
   double-click pins.
6. Edit a file in an Edit-mode tab, click Save — Changes list
   shows the new modification within ~50ms (no watcher lag).
7. Reload tabs with multiple files open — preview/pin state
   restores correctly (or all become pinned on reload; either is
   acceptable v1).

**Risks / notes:**

- The 250ms double-click debounce delays single-click feedback.
  Worth it for the VS Code idiom; if users complain, fall back to
  `pointerdown` + `dblclick` listener split (no debounce, native
  semantics).
- Preview tab state can be ephemeral (memory only) for v1; persist
  later if the UX warrants.

---

### 2.4 P1.4 — File header refactor

**Goal:** Drop the legacy `FeatureFileToolbar`; the file-tab body is
just `<mz-file-diff-card chrome="flush">` (or `<mz-code-editor>` in
Edit mode). Diff/Edit toggle lives in the new header. The same
`MzFileDiffCard` component, with `chrome="card"`, becomes the unit of
the future multi-file review surface.

**Current → target:**

|                         | Current                                                                        | Target                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Single-file tab header  | `FeatureFileToolbar` (filename + Viewed + Discard + Unified/Split + Diff/Edit) | `MzFileDiffCard` header (path + Viewed + copy + expand-all + status + refresh) + new Diff/Edit toggle slot |
| Card vs flush rendering | Card always (border, chevron, collapsible)                                     | New `chrome: 'card' \| 'flush'` + `collapsible: boolean` inputs                                            |
| Multi-file review prep  | None                                                                           | Same component with `chrome='card'`; future work composes N of these                                       |

**Files to touch:**

- `libs/mozart-ui/file-diff-card/src/lib/mz-file-diff-card.ts:84–480`
  — add inputs:
  - `chrome = input<'card' \| 'flush'>('card')`
  - `collapsible = input<boolean>(true)`
  - `headerActions = contentChild<TemplateRef>()` (for the Diff/Edit
    slot — projected, not hard-coded).
    Template changes:
  - `flush` removes the outer `border-border` ring, removes the
    chevron + collapse logic, forces `_collapsed = false`.
  - `collapsible=false` always paints the body, no toggle button.
- `libs/mozart-ui/file-diff-card/src/lib/mz-file-diff-card.spec.ts:26–65`
  — extend mount helpers with `chrome` and `collapsible`; add
  cases verifying:
  - `chrome='flush'` drops border + chevron.
  - `collapsible=false` always paints body.
  - Projected header actions render in the right slot.
- `libs/desktop-workspaces-feature/src/lib/feature-file-content.ts:67–225`
  — replace the `<app-feature-file-toolbar>` + outer
  `<hlm-tabs>` mode-switch with a single
  `<mz-file-diff-card chrome="flush" [collapsible]="false">` for
  Diff mode and `<mz-code-editor>` for Edit mode. The Diff/Edit
  toggle becomes a projected header action template, rendered
  inside the card's header.
- `libs/desktop-repositories-feature/src/lib/feature-file-toolbar.ts`
  — delete (after all callers migrated; grep for
  `FeatureFileToolbar` and `app-feature-file-toolbar`).
- `libs/desktop-repositories-feature/src/lib/feature-file-diff.ts:46–134`
  — remove the markdown preview tabs from this component (folded
  into P3.1: defer the toggle, default to Diff). Component becomes
  a thin pass-through to `MzFileDiffCard`.
- `libs/mozart-ui/file-diff-card/src/index.ts` — export the new
  inputs.

**Verification:**

1. Open a non-markdown file from All files: Edit mode is the
   default; the header shows path + Viewed + Diff/Edit toggle (no
   Unified/Split since that's `MzDiffView`'s concern, surfaced
   later).
2. Toggle to Diff: header stays put; body swaps to the diff. No
   nested card chrome.
3. Open a markdown file: Diff mode is the default (Preview
   default removed — see P3.1).
4. Confirm `MzFileDiffCard` with `chrome='card'` still renders
   the existing review surface unchanged (visual regression check).
5. Run the spec file — new cases pass; existing cases pass.

**Risks / notes:**

- `headerActions` content projection requires the consumer to
  declare a template — this is a small Angular pattern but new in
  this codebase. If `contentChild<TemplateRef>` proves awkward,
  fall back to an `@Output` slot or a directive-based portal.
- The card's existing Viewed/refresh/copy actions are kept;
  Diff/Edit slots in beside them. Avoid a "two rows of actions"
  visual — pack all into one header row.
- Don't move `MzFileDiffCard` out of `libs/mozart-ui/` — the lib is
  the right home for both the card and flush variants.

---

### 2.5 P2.1 — File tree real loading state ✅ DONE

**Reachable path:** First-ever workspace open per project, no sibling
workspace cached, fetch >150ms. The 4-tier loading hierarchy in
`FeatureFileTree` (own cache → sibling cache → local → skeleton)
short-circuits the skeleton on every other path. Eng-review decisions
locked 2026-05-24:

- **Min-delay UX (resolved):** defer-first-show 150ms. Don't render
  the skeleton until 150ms after `loading` flips true; if the fetch
  resolves before, never show it. (Plan's earlier `Math.max(...)`
  pseudocode was ambiguous and is replaced by the effect/timer spec
  below.)
- **Skeleton shape (resolved):** 3 chevron-right (collapsed) folder
  rows followed by 6 flat file rows at root level, total 9. No
  nested children placeholders.
- **Spec scope (resolved):** add both `feature-file-tree.spec.ts`
  and `ui-file-tree-skeleton.spec.ts`. Cache-hit regression test is
  mandatory.

**Goal:** When the skeleton is reached, render a tree-shaped
placeholder (not 7 generic shimmer rows), and defer first show by
150ms so sub-150ms fetches never flash it.

**Files to touch:**

- `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.ts`
  — rewrite to render **3 collapsed folder rows + 6 flat file
  rows at root level**, total 9 rows. Folder rows use
  `lucideChevronRight` + `lucideFolder` to mirror `FileTreeRow`'s
  closed-folder layout; file rows use the `w-3` spacer +
  `lucideFile`. Deterministic widths (same anti-jitter rationale as
  today). Preserve `aria-busy="true"` + `role="status"` on the
  host.
- `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts`
  — add a **defer-first-show 150ms gate** to `showSkeleton`:
  - New `pastMinDelay = signal(false)` field.
  - `effect()` on `loading()`: on false→true edge, schedule
    `setTimeout(() => pastMinDelay.set(true), 150)` and capture
    the current workspaceId; on true→false edge OR workspaceId
    change, clear the timer and reset `pastMinDelay` to false.
    Bail in the timeout callback if the captured workspaceId no
    longer matches.
  - Extend `showSkeleton` to:
    `cachedTree() === null && projectFallbackTree() === null &&
loading() && pastMinDelay()`.
  - The cache-hit short-circuit MUST stay intact — `pastMinDelay`
    is an additional AND, never an OR. Implementer must register
    a `DestroyRef` cleanup to clear any pending timer on
    component teardown.

**Tests:**

- `libs/desktop-repositories-feature/src/lib/feature-file-tree.spec.ts`
  (NEW). Vitest + Angular TestBed (same pattern as
  `feature-file-diff.spec.ts`), `fakeAsync` + `tick` for timing:
  - **CRITICAL regression:** cache-hit (own AND sibling) → skeleton
    never appears, regardless of timing, even when `pastMinDelay`
    happens to be `true` from a prior load.
  - Fetch resolves before 150ms → skeleton never shown.
  - Fetch still pending at tick 150ms → skeleton becomes visible.
  - `workspaceId` flips mid-150ms-window → timer cancelled, no
    stale `pastMinDelay` for the next workspace.
  - Component destroy mid-timer → no leaked timeout (no console
    warnings under `vi.useFakeTimers()` strict mode).
- `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.spec.ts`
  (NEW). Render snapshot (3 folder rows + 6 file rows), assert
  `aria-busy="true"` and `role="status"` on host, assert widths are
  stable across re-renders.

**Verification (manual, post-spec):**

1. Wipe `FileTreeCache`, open a new project's first workspace on a
   slow path (>150ms fetch) — tree-shaped skeleton appears after
   150ms, then the tree pops in.
2. Same as 1 but on a fast path (<150ms fetch) — skeleton NEVER
   appears.
3. Switch between sibling workspaces — sibling-tree fallback wins;
   no skeleton flash regardless of timing.
4. Rapid double-click between two uncached workspaces — no stale
   skeleton from the first; second behaves per its own timing.

**Failure modes:**

| Failure                                        | Tested?             | Handled?                                      | User sees                        |
| ---------------------------------------------- | ------------------- | --------------------------------------------- | -------------------------------- |
| Stale `pastMinDelay` flashes skeleton on cache | ✓ (regression test) | ✓ (reset on workspaceId / loading false→true) | nothing if guarded               |
| Timer fires after destroy                      | ✓                   | ✓ (DestroyRef cleanup)                        | no visible effect; prevents leak |
| Rapid workspace switch races                   | ✓                   | ✓ (captured workspaceId guard)                | no stale skeleton                |
| Slow fetch never resolves                      | n/a                 | unchanged (existing error path)               | skeleton, then error             |

No critical gaps.

---

### 2.6 P2.2 — Composer visibility on file tabs ✅ DONE

**Goal:** Composer remains visible at the bottom of the middle shell
regardless of whether the active tab is `chat` or `file`. Send
routes to the workspace's active chat from any tab. Chat-only
behaviors (auto-follow, scroll memory, at-bottom detector) stay
sealed inside the chat case.

**Plan-eng-review note:** the original two-line "extract or move
directly" sketch understated the work. `FeatureWorkspaceMiddle`
today owns five concerns: composer mount, at-bottom detector,
programmatic-scroll grace window, per-chat-tab scroll
recall/remember, message-arrival auto-follow, plus the
`ensureChatForWorkspace` bootstrap. Concerns (2)–(5) are chat-only
and target `<main>`; lifting the composer out without separating
them would either corrupt per-chat attach/detach state on every
file-tab visit or leave the composer's `scrollToBottom` /
`autoFollowChat` semantics meaningless on a file tab.

**Architecture — agreed (D1 / D2 / D3 / D4):**

```
WorkspaceDetailPage (existing)
  └── workspaceId effect → ensureChatForWorkspace (NEW, moved up
                                                   from middle)

WorkspaceTabContent (existing)
  ├── FeatureWorkspaceComposer    NEW   — always mounted
  │     reads:  ChatFacade.activeChatFor(workspaceId)
  │     writes: send / stop / mode / effort / model
  │     scroll-to-bottom overlay hidden when tab().kind === 'file'
  │     scrollToBottom emit → no-op on file tab,
  │                            forwards to orchestrator on chat tab
  │
  └── @switch tab().kind
        ├── 'chat' → FeatureChatScrollSurface  RENAMED
        │     was FeatureWorkspaceMiddle; only mounts here.
        │     owns: at-bottom detector, programmatic-scroll grace,
        │            tab-key recall/remember, messages auto-follow,
        │            composer focusComposer hooks.
        │     publishes attach/detach + scrollToBottom calls via
        │     ChatScrollOrchestrator (NEW service, workspace-scoped).
        └── 'file' → FeatureFileContent (unchanged)
```

The new `ChatScrollOrchestrator` service is the seam: composer
reads `isAttached(workspaceId)` and emits `scrollToBottom`; the
chat-scope surface registers `mainEl` on mount and tears it down on
destroy. No DOM ownership crosses component boundaries.

**Current → target:**

|                          | Current                                                                | Target                                                                                  |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Composer mount           | Inside chat `@case` only                                               | Always mounted via `FeatureWorkspaceComposer` above the `@switch`                       |
| Composer host name       | `FeatureWorkspaceMiddle` (lies after refactor)                         | Split: `FeatureWorkspaceComposer` (composer) + `FeatureChatScrollSurface` (chat scroll) |
| At-bottom detector       | Lives in `FeatureWorkspaceMiddle`, fires only when chat case is active | Stays in `FeatureChatScrollSurface`, same lifecycle gate                                |
| `ensureChatForWorkspace` | Effect inside `FeatureWorkspaceMiddle` (depends on chat-case mount)    | Effect inside `WorkspaceDetailPage.workspaceId` (fires before any tab renders)          |
| Send from file tab       | Composer not mounted → impossible                                      | Routes to workspace's active chat via `ChatFacade.sendUserMessage(id,…)`                |
| Scroll-to-bottom overlay | Bound to `<main>` (= chat surface today)                               | Hidden on file tab (`autoFollowChat=true` forced); active + correct on chat tab         |
| Composer draft (`value`) | Local to `FeatureWorkspaceMiddle` lifetime (lost when file tab active) | Local to always-mounted `FeatureWorkspaceComposer` (preserved across tabs)              |
| Stop button across tabs  | Only visible on chat tab                                               | Visible on any tab — kill-switch from anywhere                                          |

**What already exists (no rebuilding):**

- `MzComposer` (`libs/mozart-ui/composer/src/lib/mz-composer.ts`)
  — fully-functional dumb component. Inputs/outputs unchanged by
  this work.
- `ChatFacade.activeChatFor(workspaceId)`, `sendUserMessage`,
  `setChatMode`, `setChatEffort`, `setChatModel`, `cancelActive`,
  `isStreaming`, `ensureChatForWorkspace` — all already exist.
- `ScrollPositionService` — `recall`, `remember`, `isAttached`,
  `setAttached`, `setDetached`, `followModeFor` — already exist.
  The new `ChatScrollOrchestrator` wraps these for the chat-scoped
  scroll behavior; it does not replace them.
- Sticky bottom CSS pattern (`feature-workspace-middle.ts:59–86`)
  — moves wholesale onto the new composer host.
- The `<main>` overflow surface (`app-shell.ts`) — unchanged; only
  the `closestScrollable` walk relocates with
  `FeatureChatScrollSurface`.

**Files to touch:**

1. `libs/desktop-workspaces-feature/src/lib/feature-workspace-composer.ts`
   NEW — always-mounted composer host. Mirrors lines 41–88 of
   today's `feature-workspace-middle.ts` template; binds composer
   inputs from `ChatFacade.activeChatFor(workspaceId)`; on
   `tab().kind === 'file'` forces `autoFollowChat=true` and
   intercepts `scrollToBottom` to no-op (D3). Owns `value`
   signal. No DOM scroll work.
2. `libs/desktop-workspaces-feature/src/lib/feature-chat-scroll-surface.ts`
   RENAMED from `feature-workspace-middle.ts`. Drops composer
   template + bindings; keeps `mainEl` resolution, at-bottom
   listener, programmatic-scroll grace window, tab-key recall/
   remember effect, messages auto-follow effect,
   `focusComposer` hook. Registers itself with
   `ChatScrollOrchestrator` on mount and unregisters on destroy.
   Selector `app-feature-chat-scroll-surface`.
3. `libs/desktop-workspaces-data-access/src/lib/chat-scroll-orchestrator.ts`
   NEW — workspace-scoped service. Methods:
   `register(workspaceId, mainEl)`, `unregister(workspaceId)`,
   `scrollToBottom(workspaceId, smooth)`,
   `isAttachedSignal(workspaceId)`. Internally talks to
   `ScrollPositionService` for attach/detach state. No DOM walking
   logic — the chat-scope surface passes the resolved `mainEl` in.
4. `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-tab-content.ts`
   — replace the chat `@case`'s `<app-feature-workspace-middle>`
   wrapper with `<app-feature-chat-scroll-surface>`. Mount
   `<app-feature-workspace-composer>` outside the `@switch` below
   the tab bar. Pass `tab()` to the composer so it knows the
   active kind (D3).
5. `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-detail.page.ts:165–172`
   — extend the workspaceId effect with
   `this.chatFacade.ensureChatForWorkspace(id)` (D2). The facade
   is already injected for `isStreaming`.
6. `libs/desktop-workspaces-feature/src/index.ts` — replace
   `FeatureWorkspaceMiddle` export with
   `FeatureChatScrollSurface` and `FeatureWorkspaceComposer`.
7. `libs/desktop-workspaces-feature/src/lib/mz-scroll-persist.directive.ts:17`
   — update the comment referencing `FeatureWorkspaceMiddle` to
   the new name.

**Test plan (D5 — full coverage, mandatory regressions in **bold**):**

New unit specs (Vitest + Angular TestBed):

- `feature-workspace-composer.spec.ts` (NEW, 11 cases)
  - Mounts on chat tab and file tab; composer renders in both.
  - `onSend` routes via `ChatFacade.sendUserMessage(workspaceId,
text, mode)` when active tab is `chat`.
  - `onSend` routes the same call when active tab is `file`.
  - `onSend` is no-op (with warn) when `_activeChat()` is null.
  - **REGRESSION:** `currentMode`/`currentEffort`/`currentModelId`
    reflect `ChatFacade.activeChatFor(id)`.
  - `onStop` calls `cancelActive(workspaceId)` from any tab.
  - `value` signal preserved across tab switch (component is the
    same instance because it's mounted above the `@switch`).
  - On file tab: `autoFollowChat` input forced to `true` regardless
    of `ScrollPositionService.followModeFor(chatId)()`.
  - On file tab: `scrollToBottom` output does not call
    `ChatScrollOrchestrator.scrollToBottom()`.
  - On chat tab: `scrollToBottom` output forwards through the
    orchestrator.
  - On chat tab: `setAttached` write fires on send (existing
    intent, ported).
- `feature-chat-scroll-surface.spec.ts` (NEW, 9 regression cases)
  - **REGRESSION:** at-bottom detector flips
    `ScrollPositionService` to attached when distance <
    `AT_BOTTOM_THRESHOLD_PX`.
  - **REGRESSION:** at-bottom detector flips to detached when over
    threshold.
  - **REGRESSION:** programmatic-scroll grace window suppresses
    attach/detach flips for 700ms after `scrollMainToBottom(true)`.
  - **REGRESSION:** first visit to a chat tab defaults
    `scrollTop = scrollHeight` (bottom).
  - **REGRESSION:** revisit restores stored `scrollTop` from
    `ScrollPositionService.recall(key)`.
  - **REGRESSION:** cleanup on chat-switch writes
    `ScrollPositionService.remember(key, scrollTop)`.
  - **REGRESSION:** cleanup on component destroy writes the final
    `scrollTop` value.
  - **REGRESSION:** messages-arrival effect scrolls to bottom while
    attached, holds position while detached.
  - **REGRESSION:** streaming false-edge refocuses the composer
    via the composer host's exposed `focusComposer()` hook (or
    `ChatScrollOrchestrator.requestFocus()` if we route through
    the service).
- `chat-scroll-orchestrator.spec.ts` (NEW, 3 cases)
  - `register`/`unregister` correctly track mainEl per workspace.
  - `scrollToBottom(workspaceId, smooth)` honors
    `prefers-reduced-motion` (mock `matchMedia`).
  - `isAttachedSignal(workspaceId)` delegates to
    `ScrollPositionService.isAttached`.
- `workspace-detail.page.spec.ts` (NEW or extend if exists, 1
  case)
  - On workspaceId change, `ensureChatForWorkspace(id)` is called
    exactly once. Idempotent across re-fires (relies on facade
    already being idempotent).

E2E (Playwright, `apps/desktop-e2e`):

- **NEW:** Fresh workspace, first action is opening a file from
  `All files`. Composer is visible; type + Send creates the first
  chat and routes the message. Reply appears in the chat tab.
- **NEW:** Stream a response. Click a file tab mid-stream;
  composer still visible. Click back to chat tab; auto-follow has
  resumed and the latest token is at the bottom.

**Verification (manual, complements specs):**

1. Open a file tab on an existing workspace: composer visible at
   the bottom with active-chat mode/effort/model; sending routes
   to the workspace's active chat.
2. Switch back to chat tab: composer in the same spot, no layout
   shift, draft preserved.
3. On a file tab, the scroll-to-bottom overlay is never visible.
   On a chat tab during a stream, it appears when scrolling up
   and dismisses when at bottom.
4. Fresh workspace with no chats: open a file from `All files`
   first; composer is enabled; Send creates the first chat and
   delivers the message.
5. Streaming response: click a file tab mid-stream; click back —
   chat auto-follow resumed correctly.

**NOT in scope for P2.2:**

- Per-chat composer draft persistence (today `value` is
  component-local; lifted to the always-mounted composer it
  survives tab switches, but does NOT persist across reloads or
  per-chat switches). Captured as TODO.
- Active-chat selector / multi-chat-per-workspace UI for the
  composer. Today there's exactly one active chat per workspace;
  send routes to it. Visible chat picker is a future polish.
- Composer-on-file-tab feature parity with chat-tab affordances
  beyond send/stop (e.g. attachments, reference-this-file
  context-pinning) — pure visibility + send routing this round.
- Eager mount of CodeMirror in Edit mode just because the composer
  is now always visible. Unrelated.
- Routing semantics where send-from-file-tab would auto-navigate
  to the chat tab. Out per D3 — send is silent, user stays on
  the file.

**Failure modes (per new codepath):**

| Codepath                             | Realistic failure                                                  | Test?        | Error handling?         | Silent?                        |
| ------------------------------------ | ------------------------------------------------------------------ | ------------ | ----------------------- | ------------------------------ |
| Composer onSend, file tab            | activeChat is null → silently no-ops                               | ✓ unit + e2e | warn-log only           | mitigated by D2 bootstrap      |
| ensureChatForWorkspace at page entry | facade throws on first workspace mount → page renders without chat | ✓ unit       | existing facade catches | no, user sees empty sidebar    |
| chat-scope register/unregister leak  | rapid chat ↔ file flips don't tear down the at-bottom listener    | ✓ unit       | destroyRef-guarded      | no, would corrupt attach state |
| scrollToBottom on file tab           | accidentally still scrolls `<main>` (=file content)                | ✓ unit       | D3 hard gate            | yes — user sees file jump      |
| Composer mode change with null chat  | `setChatMode(undefined, …)` rejected by facade                     | ✓ unit       | facade no-ops           | yes — UI toggle reverts        |

**Risks / notes:**

- The `[active]` input on the composer is currently not used in
  `feature-workspace-middle.ts`; carry it forward only if the
  always-mounted composer needs to suppress focus-stealing while
  on a file tab. Default: no, file editor manages its own focus.
- The streaming false-edge refocus (`feature-workspace-middle.ts:
208–214`) currently uses `viewChild('composerEl')` — the
  composer host is in a different component after refactor. Route
  the refocus request through `ChatScrollOrchestrator.requestFocus
(workspaceId)` (signal-based), with `FeatureWorkspaceComposer`
  subscribing. Keeps the chat surface from DOM-walking into the
  composer.
- `lastMergeAction` / focus / unread / model catalog imports stay
  with the composer host — no orphan imports left in the chat
  scroll surface.

**Sequencing observation:** P2.2 is bigger than its "P2 polish"
label suggests. Recommend landing it AFTER P1.3 (file tabs ship
first — close button + preview/pin), so the middle shell isn't
being refactored at the same time the file-tab UX is. If P1.3
slips, P2.2 can ship independently; the file-tab `@case` already
renders without composer today.

**Worktree parallelization for P2.2:** Sequential implementation,
no parallelization opportunity. All 7 file changes touch the same
module (`libs/desktop-workspaces-feature` + a tiny bit of
`data-access`) and share dependencies. Land in one PR slice.

**Implementation tasks (P2.2-only, derived from the review):**

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — `WorkspaceDetailPage`
      — move `ensureChatForWorkspace(id)` into the existing
      workspaceId effect; remove the chat-bootstrap responsibility
      from the chat-scope surface.
  - Surfaced by: D2 — silent send no-op on file-first activation.
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-detail.page.ts`
  - Verify: unit spec; manually open a fresh workspace, click a
    file from All files first, type + Send, see message land.
- [ ] **T2 (P1, human: ~4h / CC: ~25min)** —
      `chat-scroll-orchestrator` — new workspace-scoped service
      mediating attach state + scroll-to-bottom between composer
      and chat-scope surface.
  - Surfaced by: D1 — decoupling architecture.
  - Files: `libs/desktop-workspaces-data-access/src/lib/chat-scroll-orchestrator.ts`,
    `libs/desktop-workspaces-data-access/src/index.ts`,
    `chat-scroll-orchestrator.spec.ts`.
  - Verify: 3 unit specs (register/unregister, smooth scroll,
    attach delegation).
- [ ] **T3 (P1, human: ~6h / CC: ~30min)** —
      `FeatureChatScrollSurface` — rename + slim down (drop
      composer mount + bindings, register with
      `ChatScrollOrchestrator`).
  - Surfaced by: D1, D4.
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-chat-scroll-surface.ts`
    (rename), `index.ts`, `workspace-tab-content.ts`,
    `mz-scroll-persist.directive.ts` (comment),
    `feature-chat-scroll-surface.spec.ts`.
  - Verify: 9 regression specs covering at-bottom detector, grace
    window, recall/remember, auto-follow, focus.
- [ ] **T4 (P1, human: ~5h / CC: ~25min)** —
      `FeatureWorkspaceComposer` — new always-mounted composer
      host with facade bindings and tab-aware scrollToBottom gate.
  - Surfaced by: D1, D3.
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-workspace-composer.ts`,
    `feature-workspace-composer.spec.ts`,
    `index.ts`, `workspace-tab-content.ts`.
  - Verify: 11 unit specs covering send routing, mode/effort/model
    bindings, value preservation, file-tab overlay gate.
- [ ] **T5 (P2, human: ~3h / CC: ~15min)** — Playwright e2e specs
      for the two highest-stakes flows.
  - Surfaced by: D5 — full coverage gate.
  - Files: `apps/desktop-e2e/src/composer-on-file-tab.spec.ts`
    (or extend existing workspace spec).
  - Verify: file-first send works on fresh workspace; streaming
    auto-follow resumes after tab round-trip.
- [ ] **T6 (P3, human: ~30min / CC: ~5min)** — Update
      `mz-scroll-persist.directive.ts:17` comment to reference
      `FeatureChatScrollSurface`.
  - Surfaced by: D4 — naming consistency.
  - Files: `libs/desktop-workspaces-feature/src/lib/mz-scroll-persist.directive.ts`.
  - Verify: grep finds zero references to `FeatureWorkspaceMiddle`
    after T3 + T6 land.

---

### 2.7 P2.3 — Save/Discard overlay

**Goal:** Save/Discard buttons sit as an absolute overlay above the
editor surface — shadow ring, fade-in when `dirty()` is true, no
layout push.

**Files to touch:**

- `libs/desktop-workspaces-feature/src/lib/feature-file-content.ts:85–117`
  — wrap the existing buttons in `<div class="absolute bottom-3
right-3 z-10 …">`; bind visibility to `dirty()` with a CSS
  transition. Drop the `border-b`. Editor reclaims the 8px row.

**Verification:**

1. Make an edit: overlay fades in.
2. Save: overlay fades out; editor content unchanged in size.
3. Discard: same.

---

### 2.8 P2.4 — Human-readable hunk labels ✅ DONE

> **Decisions from /plan-eng-review 2026-05-24:** Replace the doc-line text directly (label IS the text). Tooltip shows the raw `@@` via `title` on a line decoration. **Hide the hunk row entirely when both gaps adjacent to the hunk are fully revealed** — a fully-expanded hunk no longer needs a separator row. Label describes the gap above ("N lines above"), coupling to the P2.5 button's action. Function-scope suffix preservation deferred to TODOS.md.

**Goal:** Replace `@@ -120,7 +120,8 @@` with `"120 lines above"` (or `"No more lines above"` when `linesAvailable === 0`). When a hunk's gap-above AND the next gap (= gap-below this hunk) are both empty, omit the hunk header row entirely so the diff reads as continuous context. Raw `@@` available via `title` attribute for diff-literate users.

**Implementation notes:**

```
buildDocPlan hunk-header branch (cm-diff-extensions.ts:131-140)

  pre-pass items[] once, build nextHunkLinesAvailable[gapIndex] map.

  for each RenderItem of kind 'hunk-header':
    linesAbove = item.linesAvailable
    linesBelow = nextHunkLinesAvailable[item.gapIndex] ?? 0
    if linesAbove === 0 && linesBelow === 0:
      SKIP — don't append a doc line for this hunk header
    else:
      label = formatHunkLabel(linesAbove)        ← new pure helper
      appendLine(label, {
        kind: 'hunk',
        oldLine: null, newLine: null,
        hunkGapIndex: item.gapIndex,
        hunkLinesAvailable: linesAbove,
        originalHeader: item.text,               ← new LineMeta field
      })

buildLineDecorations hunk branch (cm-diff-extensions.ts:235-237)

  for hunk-kind line:
    builder.add(linePos, linePos, HUNK_LINE_DECO)
    if (meta.originalHeader):
      builder.add(linePos, linePos, Decoration.line({
        attributes: { title: meta.originalHeader }
      }))
```

**`formatHunkLabel` contract:**

| Input     | Output                                                            |
| --------- | ----------------------------------------------------------------- |
| `n > 1`   | `"${n} lines above"`                                              |
| `n === 1` | `"1 line above"`                                                  |
| `n === 0` | `"No more lines above"` (defensive; caller usually hides the row) |

**Files to touch:**

- `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts`
  - `LineMeta` (line 22): add `readonly originalHeader?: string`.
  - `buildDocPlan` hunk-header branch (lines 131–140): consume the pre-pass lookahead, hide row when both gaps empty, swap `item.text` for `formatHunkLabel(linesAvailable)`, pass `originalHeader` through `LineMeta`.
  - `buildLineDecorations` hunk branch (lines 235–237): when `meta.originalHeader` present, also emit a `Decoration.line` with `attributes.title`.
  - New `formatHunkLabel(n: number): string` pure helper near `formatNumber` (line 554).
  - Header comment block (lines 76–87): update to reflect doc-text-is-label model — diagram maintenance per CLAUDE.md.
- `libs/mozart-ui/diff-parser/src/lib/diff-parser.ts` — no change. `DiffHunk` already exposes the parsed counts.

**Tests:** new spec file — see §2.8.1 below.

**Verification:**

1. Open a diff with multiple hunks: each row shows a human label,
   tooltip shows the original `@@` syntax.
2. Fully expand a middle hunk's gap-above AND gap-below — that hunk's header row disappears from the doc; adjacent lines flow together.
3. First hunk starts at line 1 (no gap above): hunk row is hidden from first render.
4. Copying a hunk row puts the human label on the clipboard. The original `@@` only appears on hover.

**Risks / notes:**

- The hide-on-both-empty refinement requires a one-pass lookahead in `buildDocPlan`. Build the `nextHunkLinesAvailable[gapIndex]` map once before the loop — do not do an O(n²) inner search.
- When a hunk row hides, gutter line numbers on surrounding rows must still align. Verify visually with a multi-hunk diff where one middle hunk hides.
- If `formatHunkLabel` ever wants to surface the step constant (e.g., `"Show 20 lines above"`), key off `HUNK_EXPAND_STEP` (line 49). Do not introduce a second magic 20.

---

#### 2.8.1 New spec file: `cm-diff-extensions.spec.ts`

**Goal:** Close the test gap on the CodeMirror integration layer. Today the entire 600-LOC `cm-diff-extensions.ts` has zero direct tests — `mz-diff-view.spec.ts` only covers upstream `buildRenderItems` (data shape, not rendering). P2.4 + P2.5 both edit this file; ship the spec alongside.

**Cases (≥14):**

1. `formatHunkLabel(120)` → `"120 lines above"`
2. `formatHunkLabel(1)` → `"1 line above"` (singular)
3. `formatHunkLabel(0)` → `"No more lines above"`
4. `buildDocPlan`: single hunk-header with `linesAvailable > 0` → one hunk doc line; text is the formatted label; `LineMeta.originalHeader === item.text`.
5. `buildDocPlan`: single hunk-header with `linesAvailable === 0` and no next hunk → row hidden (no doc line emitted; `lineMeta.length` is one less than the hunk-header items count).
6. `buildDocPlan`: two consecutive hunk-headers where both gaps empty → both rows hidden.
7. `buildDocPlan`: two hunks, gap above first empty + gap between them non-zero → only the first hunk row hides.
8. `buildDocPlan`: code-line items between hunk-headers stay in document order; widget specs unchanged.
9. `buildLineDecorations`: hunk-kind line gets `HUNK_LINE_DECO` AND a title decoration with the original header.
10. `buildLineDecorations`: hunk-kind line whose meta has no `originalHeader` gets only `HUNK_LINE_DECO` (defensive).
11. `buildLineDecorations`: add/remove kinds still get their respective line decos + inline markers — regression guard for §2.8 changes not breaking unrelated paths.
12. `HunkButtonMarker.eq`: same gapIndex + linesAvailable → equal; differing values → unequal.
13. `HunkButtonMarker.toDOM`: when `linesAvailable === 0` the button is disabled and title is `"No more hidden lines"`.
14. `HunkButtonMarker.toDOM`: when `linesAvailable > 0` the button title matches `Show ${min(HUNK_EXPAND_STEP, linesAvailable)} lines above`.
15. `HunkButtonMarker.toDOM` (P2.5): wider hit-target classes applied; count badge `+${min(HUNK_EXPAND_STEP, linesAvailable)}` renders inside the button.
16. `HunkButtonMarker.toDOM` (P2.5): dispatching a `MouseEvent('click', { shiftKey: true })` fires `onExpand` with `count = min(2 * HUNK_EXPAND_STEP, linesAvailable)`.

**Fixtures:** reuse the `makeHunk(startLine, endLine)` pattern from `mz-diff-view.spec.ts:50–80`. `toDOM` cases use jsdom (already configured for this lib).

**Verification:** `pnpm nx test diff-view` passes; new file in the suite output; coverage report shows non-zero lines in `cm-diff-extensions.ts`.

---

### 2.9 P2.5 — Better expand-context button ✅ DONE

> **Decisions from /plan-eng-review 2026-05-24:** Keep the button in the gutter (it stays a `GutterMarker`, not a block widget) — preserves the §2.8 doc-line architecture. Widen the hit target ~2× (12×12 circle → ~24×16 strip with chevron + `+20` count badge). The doc-line label from P2.4 lives in parallel: button = action, row text = static info.

**Goal:** The hunk-row gutter chevron becomes a ~24px wider hit target with chevron + count badge (`"+20"`, or `"+12"` when fewer lines remain). Disabled with `"No more hidden lines"` title when `linesAvailable === 0`. Behavior preserved: click expands `HUNK_EXPAND_STEP` lines up; shift-click doubles.

**Files to touch:**

- `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:478–532` — `HunkButtonMarker.toDOM`:
  - Replace the 12×12 circle with a wider strip-shaped button (~24px × 16px), still positioned in the OLD gutter cell with the `translate(50%, -50%)` math so the visual centroid stays on the column seam.
  - Append a `<span>` inside the button rendering `+${min(HUNK_EXPAND_STEP, linesAvailable)}` next to the existing `lucideChevronUp` icon. Hide the count when `linesAvailable === 0`.
  - Tailwind: drop `h-4 w-4 rounded-full`; replace with `h-5 px-1 rounded-md` (or similar). Keep within the hunk-band vertical rhythm.
  - Title logic unchanged.
- Add a one-line comment near the click handler (lines 523–528) documenting shift-click doubles to `2 × HUNK_EXPAND_STEP`.

**Tests:** covered by §2.8.1 cases 12–16.

**Verification:**

1. Hunk-row button is visibly wider than before; chevron + `+20` count both render.
2. Click expands `HUNK_EXPAND_STEP` lines (20). Shift-click expands 40 (still works under the wider DOM).
3. Fully expanded: button disables, count hides, title becomes `"No more hidden lines"`. The whole row hides per §2.8's hide-on-both-empty rule.
4. Visual: the strip stays inside the gutter columns; the doc-line text ("120 lines above") sits to its right; nothing collides.

**Risks / notes:**

- The wider button still uses `transform: translate(50%, -50%)` to position over the column seam. Verify in dev that the wider shape doesn't overflow on the left (the OLD column natural width ≈ 32px; 24px button + half-translate fits).
- Don't widen so much that the button overlaps the new row text — keep at least 8px between the button's right edge and the start of the doc area.
- Count badge changes `+20` → `+12` etc. as `linesAvailable` shrinks below `HUNK_EXPAND_STEP`. `HunkButtonMarker.eq()` already keys off `linesAvailable`, so re-render is automatic.

---

### 2.10 P2.6 — Setup/Run tab UX

**Goal:** Empty state on Setup tab tells the user how to configure a
run command. Run tab investigation: confirm the "not working" claim
is actually the auto-route to Run on start, not a real bug.

**Files to touch:**

- `libs/desktop-workspaces-feature/src/lib/feature-workspace-processes/feature-workspace-setup.ts:79–87`
  — when `project.runCommand` is missing, render an explicit
  empty-state card with a CTA: "Set up a run command in project
  settings →". Link routes to the project settings page.

**Verification:**

1. Workspace whose project has no run command: Setup tab shows a
   helpful empty state with a link.
2. Run tab end-to-end: configure a run command, start a run, see
   output flow.

---

### 2.11 P2.7 — Terminal first-load visual

**Goal:** First activation of the Terminal tab paints something
sensible during the xterm construction window.

**Files to touch:**

- `libs/desktop-workspaces-feature/src/lib/feature-workspace-processes/feature-workspace-processes.ts:131–138`
  — choose one of:
  - Replace `hlmTabsContentLazy` with eager mount + CSS hide; xterm
    constructs on workspace activation, not first tab click.
  - Keep lazy but paint a "Connecting…" placeholder during the
    construction window.
- Likely the eager mount is too expensive for cold workspace
  switches — go with the placeholder.

**Verification:**

1. Open a workspace, click Terminal tab — placeholder for ~50ms,
   then xterm appears. No flash of unstyled element.

---

### 2.12 P3.1 — Preview mode

**Goal:** Preview is never the default. The Preview/Diff toggle
either stays as a non-default option for `.md/.mdx`, or is removed
entirely pending a planning decision.

**Files to touch:**

- `libs/desktop-repositories-feature/src/lib/feature-file-diff.ts:161–163`
  — flip the `linkedSignal` to always return `'diff'` for the
  initial value; user can still toggle to Preview.
- Optional next round: rename "Preview" → "Render" or "Rendered"
  to disambiguate from the future review-preview surface.

**Verification:**

1. Open a `.md` file from Changes: opens in Diff. Preview tab
   still selectable but not active by default.
2. Open a `.md` file from All files: opens in Edit (already
   correct, P1.3 verification covers this).

---

## 3. Cross-cutting notes

### 3.1 Workspace status state machine

Today: `UiWorkspaceStatus = 'backlog' | 'in_progress' | 'in_review' |
'done' | 'canceled'` (`workspace-status.ts:6–11`). The only automatic
transition is `merge_workspace_locally` → `'done'`. Everything else
is manual.

After P1.1, the transition table:

| Trigger                           | From          | To              | Where                                             |
| --------------------------------- | ------------- | --------------- | ------------------------------------------------- |
| First commit                      | `'backlog'`   | `'in_progress'` | `workspace.facade.commitWorkspace` (post-success) |
| `create_workspace_pr` success     | any           | `'in_review'`   | `shell-right.ts` after dialog close               |
| `merge_workspace_locally` success | any           | `'done'`        | already in Rust                                   |
| User manual cancel                | any           | `'canceled'`    | kanban drag (out of scope)                        |
| PR closed externally              | `'in_review'` | manual          | future work — GitHub webhooks or polling          |

The transition logic lives in the Angular facade, not Rust, so we
have one writer per status flip. Rust still owns the merge
transition because it's atomic with the worktree state.

### 3.2 GitHub connection model

`ProfileFacade.githubConnected()` is a `Signal<boolean>` derived from
`_githubState === 'connected'`. `initializeGithub()` runs on app boot
and probes the token via `github::probe_token` (→ `GET /user`).

`FeatureCreatePrDialog` should:

1. Inject `ProfileFacade`.
2. Render an inline alert when `!githubConnected()`.
3. Disable submit when `!githubConnected()`.
4. Provide a "Connect GitHub" link that triggers the existing
   `Profile` connection flow.

The merge-action menu already gates the primary button on the
signal — no change there beyond making `'pr'` the only reachable
primary action.

### 3.3 Multi-file review prep

The `chrome: 'card' | 'flush'` + `collapsible: boolean` inputs on
`MzFileDiffCard` set up the architectural seam. Future review
surface:

- One `<mz-file-diff-card chrome='card' [collapsible]="true">` per
  reviewed file, rendered in a scrollable column.
- Each card's Viewed toggle persists per file (already an output;
  wire to a per-workspace store).
- The active card's `[active]="true"` paints the brand ring around
  its body.
- Refresh / pathCopy / expand-all already work; reuse them as-is.

Don't build the review surface yet. Just ship the chrome variant
and confirm the existing single-file-tab use case migrates onto it
cleanly.

### 3.4 Open questions for follow-up

- **Preview mode (P3.1)**: rename to "Render"? Remove entirely until
  a richer review surface lands? Decide in next planning round.
- **Persisted Changes snapshot (P1.2)**: hold the snapshot in
  `app_handle.store` or in IndexedDB? Latter is simpler; former is
  consistent with the rest of the persisted state.
- **Preview-tab persistence (P1.3)**: should preview tabs survive
  reload, or all become pinned? Recommend ephemeral for v1.
- **Status hook idempotency (P1.1)**: handle the case where
  `setStatus` is called twice with the same value (cheap no-op).

---

## 4. Verification checklist (whole-doc)

Cold reader sanity checks before any code change:

- [ ] Run the app (`pnpm nx serve desktop` or equivalent) on a
      project with a connected GitHub remote AND a configured run
      command — confirm the three user-claimed bugs: - [ ] Changes list resets on reload (P1.2 — should be
      reproducible). - [ ] Setup tab works when `runCommand` is set (P2.6 — likely
      the "not working" claim is wrong on a configured project). - [ ] Terminal first-load has a visual glitch (P2.7 —
      confirm with a fresh workspace).
- [ ] File tab close `×` is invisible on every file tab (P1.3 —
      confirm the gating bug visually).
- [ ] Hunk headers show raw `@@ -120,7 @@` text (P2.4 — confirm
      target state is worth the work).
- [ ] Preview mode is auto-default on `.md` files (P3.1 — confirm).

Each P1 item ends with its own verification block (see §2.1–§2.4).
Each P2/P3 item likewise.

---

## 5. Out of scope

- Multi-file review view itself (just the seam).
- GitHub webhook integration / PR status sync.
- Workspace kanban automation beyond the four explicit transitions.
- Unified/Split diff layout work (`MzDiffView` already has the
  hooks; layout is decoupled from this work).
- Composer mode/prompt routing redesign — keep current behavior;
  P2.2 only fixes visibility.
- Saving CodeMirror scroll position in edit mode (captured in
  `TODOS.md` per `feature-file-content.ts:328–332`).

---

## 6. Sequencing recommendation

Suggested order for execution (each item is one PR slice):

1. **P1.3 close-button bug** (smallest, highest user-visible
   value) — 1 file change.
2. **P1.1 PR workflow rewire** — touches 4 files but no new
   abstractions.
3. **P1.4 file header refactor** — biggest architectural change;
   land before P1.3's preview/pin polish so the header is settled.
4. **P1.3 preview/pin tabs + save→Changes sync** — relies on P1.4
   for the header shape.
5. **P1.2 Changes persistence + rename** — independent; can ship
   in parallel.
6. **P2 polish wave** — independent items, ship as capacity
   allows.
7. **P3.1 preview-mode default flip** — one-liner; ship anytime.

This sequencing keeps each PR under ~300 lines diff and avoids
landing the architectural change after the polish that depends on it.

---

## 7. Engineering review outcomes — P1.1 ✅ DONE

Captured during `/plan-eng-review` on 2026-05-24 against §2.1 (P1.1 PR
workflow rewire). Earlier sections are the RFC; this section is the
implementation contract for P1.1 specifically. P1.2–P3.1 keep §2 as-is
until their own review runs.

### 7.1 Decisions (D1–D10)

| ID  | Topic                                                                                            | Choice                                                 | Implication                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Where do `commit → in_progress` and `PR success → in_review` writers live?                       | **Facade wrappers in WorkspacesFacade**                | Adds `WorkspacesFacade.commitWorkspace(...)` and `WorkspacesFacade.createPr(...)`. One writer per transition; mirrors existing `setStatus / reopen / togglePinned` shape at `workspace.facade.ts:307–336`. Both dialogs (`feature-commit-dialog`, `feature-create-pr-dialog`) route through the wrappers.                                                                                   |
| D2  | What happens when `createWorkspacePr` succeeds but `setStatus('in_review')` adapter write fails? | **Best-effort flip + warn toast**                      | The wrapper attempts the flip optimistically; on adapter failure it logs and surfaces a warn toast `"PR opened, but status update failed — refresh to retry"`. It does NOT roll back the in-memory flip. The PR URL is still returned. Reload re-reads from the DB and may show drift (covered by the reconciliation TODO from D8).                                                         |
| D3  | Should the PR-success flip be guarded against backward state transitions?                        | **Guard on `from ∈ {backlog, in_progress}`**           | `createPr` checks the current status before flipping. `done` / `canceled` workspaces are NOT regressed to `in_review` even though the right-aside merge menu still shows for them (`shell-right.ts:62–69` has no `isFrozen` guard). Mirrors the commit-flip guard.                                                                                                                          |
| D4  | Resolve §3.4: should `setStatus` early-return on no-op?                                          | **Yes — add `if (previous === status) return;`**       | Three-line defensive add at the top of `setStatus`. Closes the §3.4 open question. Eliminates wasted SQLite round-trip + spurious rollback path on the new wrapper paths.                                                                                                                                                                                                                   |
| D5  | MergeActionMenu: drop `primaryAction` input or keep it?                                          | **Keep the input; shell-right passes `'pr'` constant** | Component API stays as-is; the temporary "PR is the only reachable primary" policy lives in shell-right's `mergePrimaryAction` returning `'pr'`. Re-enabling Merge now is a one-line revert. Minor dead-code smell on the `'local'` branches in label/icon/tooltip computeds is acceptable.                                                                                                 |
| D6  | Test coverage tier?                                                                              | **Full lake (A)**                                      | Four spec files plus E2E. New: `workspace.facade.spec.ts`, `merge-action-menu.spec.ts`, `feature-create-pr-dialog.spec.ts`, `apps/desktop-e2e/.../pr-workflow.e2e.spec.ts`. Pattern matches `mz-file-diff-card.spec.ts` (TestBed + provideZonelessChangeDetection + matchMedia stub).                                                                                                       |
| D7  | Outside voice (codex) on the plan?                                                               | **Skipped**                                            | User declined the second-opinion gate. In-skill review stands.                                                                                                                                                                                                                                                                                                                              |
| D8  | TODO #1 — reconciliation pass for PR-vs-status drift?                                            | **Add to TODOS.md**                                    | Captures the rare-failure recovery path D2 deferred. See `TODOS.md` → "Workspaces — reconciliation pass for PR-vs-status drift (P1.1 D2 follow-up)".                                                                                                                                                                                                                                        |
| D9  | "Repo not linked to GitHub remote" gate — in P1.1 or deferred?                                   | **Add detection + gate inside P1.1**                   | New Tauri command exposing the result of `parse_github_remote` (or an equivalent boolean), new `ProjectsFacade.isGithubRemoteFor(projectId)` signal, MergeActionMenu gates primary + dropdown PR row on BOTH `githubConnected` AND `isGithubRemote`. Tooltip text differentiates the two gate states. Out of scope here: the guided "Link this repo to GitHub" provisioning flow (see D10). |
| D10 | TODO #2 — guided "Link this repo to GitHub" provisioning flow?                                   | **Add to TODOS.md**                                    | The recovery path for users on local-only or non-GitHub repos. See `TODOS.md` → "Workspaces — guided 'Link this repo to GitHub' flow (P1.1 D10)".                                                                                                                                                                                                                                           |

### 7.2 What already exists (reused, not rebuilt)

- **Optimistic-rollback `setStatus`** pattern at `workspace.facade.ts:307–318`, mirrored by `reopen` (`:325–336`), `togglePinned` (`:340–351`), `toggleUnread` (`:353–364`). The two new wrappers follow the same shape.
- **`ProfileFacade.githubConnected()` signal** at `profile.facade.ts:95`. Bootstrapped by `initializeGithub()` on app boot (`:102–111`). Plan §2.1's primary disable + dropdown row tooltip already wire to it (`merge-action-menu.ts:85`, `:115–117`).
- **`commands.createWorkspacePr`** returns `{ number, html_url }` via `github.rs:60–110`. The wrapper does not need a Rust change for D1's facade move.
- **`parse_github_remote`** at `apps/desktop-tauri/src/github.rs:131` already exists and is unit-tested for GitHub vs GitLab vs SSH vs empty. D9 just needs to expose the result to Angular.
- **`merge_workspace_locally`** at `apps/desktop-tauri/src/commands/mod.rs:2386–2404` continues to own the `'done'` transition. Rust stays the writer for atomic-with-worktree transitions; Angular owns the `'soft'` derived transitions. The asymmetry is intentional per §3.1.
- **`lastMergeAction`** persistence stays untouched; only `'pr'` reaches it for now (per plan §2.1 risks). The field is intentionally dead-coded for re-enablement.

### 7.3 Failure modes (this slice)

For each new codepath, one realistic production failure:

| Codepath                                                                    | Failure                                                                                               | Test?                                                                                                           | Error handling?                                                              | User sees?                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `WorkspacesFacade.setStatus` (early-return added)                           | Race: caller A reads `previous` then caller B writes a different status before A's adapter call lands | T10 — covers `previous === status` no-op path; race itself is unobservable under signals' synchronous semantics | Existing adapter try/catch rolls back                                        | No visible effect on no-op; race outcome reflects last-writer-wins (correct)          |
| `WorkspacesFacade.commitWorkspace` (NEW)                                    | Commit fails after the new wrapper read the workspace                                                 | T10 — covers commit-failure-no-flip                                                                             | Error rethrown to caller; commit-dialog renders inline error (existing path) | Inline error in commit dialog                                                         |
| `WorkspacesFacade.createPr` (NEW) — happy path                              | PR creates, flip fires from valid from-state                                                          | T10 + T13 (E2E)                                                                                                 | None needed                                                                  | Badge advances to `in_review`                                                         |
| `WorkspacesFacade.createPr` (NEW) — flip-failure                            | PR creates, `setUiStatus` adapter throws                                                              | T10 (D2 path)                                                                                                   | D2 best-effort: log + warn toast                                             | Toast `"PR opened, but status update failed — refresh to retry"` + PR URL still shown |
| `WorkspacesFacade.createPr` (NEW) — backward guard                          | PR opened against `done` workspace                                                                    | T10 (D3 path)                                                                                                   | D3 guard: no flip                                                            | Status stays `done`; PR URL still shown                                               |
| `feature-create-pr-dialog` — mid-flow disconnect                            | `githubConnected` flips to false while dialog open                                                    | T12 + T13 (E2E)                                                                                                 | Live alert + submit disabled                                                 | Inline alert with "Connect GitHub" link                                               |
| `MergeActionMenu` (D9 gate) — non-GitHub remote                             | Workspace on GitLab/local repo, user authenticated to GitHub                                          | T11 + T13 (E2E)                                                                                                 | Primary + dropdown PR row disabled with differentiated tooltip               | Tooltip "This repo isn't on GitHub" instead of "Connect GitHub to open PRs"           |
| `commands.createWorkspacePr` — token revoked between dialog open and submit | Submit fires, command returns `r.status === 'error'`                                                  | T12                                                                                                             | Existing error inline in dialog                                              | Inline error, submit re-enabled, status does NOT flip                                 |

**No critical gap.** Every new failure mode has a test, error handling, AND user-visible signal.

### 7.4 NOT in scope (P1.1 additions to §5)

- **`isFrozen` guard on the right-aside merge action menu.** The menu remains visible on `done` / `canceled` workspaces; the D3 from-state guard prevents the regression. Hiding the menu entirely is a UX call deferred to a future polish pass.
- **Reconciliation pass for PR-vs-status drift.** Deferred to TODOS.md via D8. The D2 best-effort failure handling is sufficient for the rare path.
- **Guided "Link this repo to GitHub" provisioning flow.** Deferred to TODOS.md via D10. P1.1 only detects + gates; the link flow is a separate workstream.
- **Audit/telemetry for status transitions.** Out of scope; can be added later without disturbing the wrappers.
- **Abort signal for in-flight dialog submission.** Existing `submitting()` flag suffices; abort-on-close is a minor polish for a separate pass.
- **PR list / PR status sync from GitHub** (already excluded by §5; reiterated here so the boundary is clear).

### 7.5 Worktree parallelization strategy

**Sequential implementation, no parallelization opportunity.** All P1.1 changes are tightly coupled — the facade wrappers (T1–T3) are consumed by both dialog changes (T6, T7) and the gate work (T8–T9) shares the workspaces-ui module with the menu changes (T4–T5). The test work (T10–T13) blocks behind the implementation tasks. Within a single developer's session, the natural order is: T3 → T1 → T2 → T8 → T9 → T4 → T5 → T6 → T7 → T10 → T11 → T12 → T13.

### 7.6 Implementation tasks

Synthesized from the decisions above. Run with Claude Code or Codex;
checkbox as you ship. JSONL artifact for `/autoplan` aggregation:
`~/.gstack/projects/t1m4lc-mozart/tasks-eng-review-20260524-163044.jsonl`
(13 tasks, all P1).

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — `workspaces-data-access` — Add `WorkspacesFacade.commitWorkspace` + `createPr` wrappers (single writer for status transitions)
  - Surfaced by: **D1 (Architecture)** — facade wrappers chosen over inline-in-consumers or Rust-side
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace.facade.ts`
  - Verify: `pnpm nx test desktop-workspaces-data-access` (after T10 lands)
- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — `workspaces-data-access` — `createPr`: gate flip on `from ∈ {backlog, in_progress}`; best-effort + warn toast on adapter failure
  - Surfaced by: **D2 + D3 (Architecture)** — from-state guard against regression; best-effort over rollback on flip failure
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace.facade.ts`
  - Verify: T10 spec asserts both branches (guard fires; flip-failure toasts + keeps optimistic flip)
- [ ] **T3 (P1, human: ~10min / CC: ~2min)** — `workspaces-data-access` — `setStatus`: early-return when `previous === status` (resolves §3.4)
  - Surfaced by: **D4 (Code Quality)** — close §3.4 idempotency open question with 3-line guard
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace.facade.ts`
  - Verify: T10 spec asserts adapter is NOT called when the new status equals the current
- [ ] **T4 (P1, human: ~30min / CC: ~5min)** — `workspaces-ui` — `MergeActionMenu`: add `localMergeDisabled` input (default `true`); Soon badge + Coming-soon tooltip on the Merge-now row
  - Surfaced by: **plan §2.1** (target table); **D5** — keep `primaryAction` input intact for future re-enable
  - Files: `libs/desktop-workspaces-ui/src/lib/merge-action-menu.ts`
  - Verify: T11 spec; manual check that the badge renders next to the row label and the tooltip reads "Coming soon"
- [ ] **T5 (P1, human: ~10min / CC: ~2min)** — `shell-feature` — `shell-right`: `mergePrimaryAction` returns `'pr'` constant; pass `localMergeDisabled=true` to merge-action-menu
  - Surfaced by: **plan §2.1**; **D5** — temporary policy lives in one place
  - Files: `libs/desktop-shell-feature/src/lib/shell-right.ts`
  - Verify: dropdown shows only Create PR enabled; Merge now disabled with Soon badge
- [ ] **T6 (P1, human: ~45min / CC: ~10min)** — `repositories-feature` — `FeatureCreatePrDialog`: inject `ProfileFacade` + `WorkspacesFacade`; inline alert + submit gate on `!connected`; route via `workspaces.createPr` (not `commands.createWorkspacePr`)
  - Surfaced by: **plan §2.1** (Files to touch); **D1** — dialog calls the wrapper, not commands directly
  - Files: `libs/desktop-repositories-feature/src/lib/feature-create-pr-dialog.ts`
  - Verify: T12 spec; manual mid-flow disconnect test (open dialog connected, run `gh auth logout`, see alert appear and submit disable)
- [ ] **T7 (P1, human: ~15min / CC: ~3min)** — `repositories-feature` — `FeatureCommitDialog`: swap `this.repos.commitWorkspace` → `this.workspaces.commitWorkspace` (**R2 regression**)
  - Surfaced by: **D1** — route through the new wrapper so the `commit → in_progress` flip fires
  - Files: `libs/desktop-repositories-feature/src/lib/feature-commit-dialog.ts`
  - Verify: T10 spec covers the wrapper; T13 E2E covers the round-trip; existing manual happy-path commit still works (R2 regression)
- [ ] **T8 (P1, human: ~2h / CC: ~15min)** — `projects-data-access + tauri` — Detect `isGithubRemote`: new Tauri command (or extend project metadata) + `ProjectsFacade.isGithubRemoteFor(projectId)` signal
  - Surfaced by: **D9 (Architecture)** — close the repo-level GitHub gate raised in the user's D8 reply
  - Files: `apps/desktop-tauri/src/commands/mod.rs`, `apps/desktop-tauri/src/github.rs`, `libs/desktop-projects-data-access/src/lib/projects.facade.ts`, `libs/desktop-core-tauri/src/lib/tauri-adapters.ts`
  - Verify: unit test for the Rust side reusing `parse_github_remote`'s existing tests; signal returns `true` for a known-GitHub-origin workspace, `false` for a GitLab fixture
- [ ] **T9 (P1, human: ~30min / CC: ~5min)** — `workspaces-ui + shell-feature` — `MergeActionMenu` accepts `isGithubRemote` input; gate primary + dropdown PR row on `(githubConnected AND isGithubRemote)`; differentiated tooltip text
  - Surfaced by: **D9** — symmetric disabled-with-tooltip pattern; shell-right binds the new signal
  - Files: `libs/desktop-workspaces-ui/src/lib/merge-action-menu.ts`, `libs/desktop-shell-feature/src/lib/shell-right.ts`
  - Verify: T11 spec; manual check on a non-GitHub repo workspace (tooltip should read "This repo isn't on GitHub" rather than "Connect GitHub to open PRs")
- [ ] **T10 (P1, human: ~2h / CC: ~15min)** — `workspaces-data-access (test)` — NEW `workspace.facade.spec.ts`: `setStatus` idempotency (**R1 regression**), `commitWorkspace` from-state, `createPr` from-state guard, best-effort flip-failure, rollback
  - Surfaced by: **D6 (Test review tier A)**; **R1 regression** (mandatory)
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace.facade.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-data-access` passes; coverage report shows the new branches hit
- [ ] **T11 (P1, human: ~1h / CC: ~10min)** — `workspaces-ui (test)` — NEW `merge-action-menu.spec.ts`: `primaryAction='pr'` rendering, `localMergeDisabled` true/false, Soon badge, dropdown PR row gating with both gates (`connected` + `isGithubRemote`)
  - Surfaced by: **D6 (Test review tier A)**
  - Files: `libs/desktop-workspaces-ui/src/lib/merge-action-menu.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-ui` passes
- [ ] **T12 (P1, human: ~1h / CC: ~10min)** — `repositories-feature (test)` — NEW `feature-create-pr-dialog.spec.ts`: submit happy path, `!connected` → alert + submit disabled, mid-flow disconnect via signal flip, error inline on `r.status === 'error'`, double-submit guard
  - Surfaced by: **D6 (Test review tier A)**
  - Files: `libs/desktop-repositories-feature/src/lib/feature-create-pr-dialog.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-repositories-feature` passes
- **T13 — DEFERRED to TODOS.md.** Originally scoped as a Playwright E2E (`pr-workflow.e2e.spec.ts`) covering the connected happy path, disconnected gate, mid-flow disconnect, and non-GitHub-remote gate. Blocked on infrastructure: `apps/desktop-e2e` only ships an Nx scaffold and the Angular app calls Tauri commands during boot without a `mockIPC` shim. Tracked in `TODOS.md` ("desktop-e2e — Playwright PR-workflow coverage (P1.1 T13)"). Unit + component coverage from T10–T12 (42 tests) anchors every contract this would have exercised.

### 7.7 Test plan artifact

Detailed test plan with affected surfaces, edge cases, and critical paths:
`~/.gstack/projects/t1m4lc-mozart/timothy-main-eng-review-test-plan-20260524-160911.md`

Consumed by `/qa` and `/qa-only` as primary test input when QAing the
shipped slice.

### 7.8 §3.4 follow-up — resolved during this review

- ✅ **Status hook idempotency (P1.1)** — resolved via D4. `setStatus` early-returns when `previous === status`. See T3.

The remaining §3.4 open questions (preview mode, persisted Changes
snapshot, preview-tab persistence) belong to P1.2 / P1.3 / P3.1 and
are unchanged.

## 8. Implementation Tasks (P2.1) ✅ DONE

Synthesized from `/plan-eng-review` on 2026-05-24. Each task derives
from a finding above. Run with Claude Code or Codex; checkbox as you
ship.

- [ ] **T1 (P2, human: ~45min / CC: ~5min)** — ui-file-tree-skeleton —
      Rewrite skeleton as 3 collapsed folder rows + 6 flat file rows
  - Surfaced by: Section 2 (Code Quality) — plan visual spec
    contradiction (collapsed folders vs nested placeholders)
  - Files: `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.ts`
  - Verify: visual snapshot matches §2.5; `aria-busy="true"` and
    `role="status"` preserved on host
- [ ] **T2 (P2, human: ~1.5h / CC: ~10min)** — feature-file-tree —
      Add defer-first-show 150ms gate to `showSkeleton`
  - Surfaced by: Section 1 (Architecture) — plan pseudocode
    ambiguous between min-hold and defer-show; resolved to defer-show
  - Files: `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts`
  - Verify: cache-hit short-circuit unaffected; <150ms fetch never
    shows; >150ms fetch shows after gate
- [ ] **T3 (P2, human: ~1h / CC: ~10min)** — feature-file-tree —
      Add `feature-file-tree.spec.ts` with cache-hit regression +
      timing matrix + rapid-switch reset
  - Surfaced by: Section 3 (Tests) + IRON regression rule
  - Files: `libs/desktop-repositories-feature/src/lib/feature-file-tree.spec.ts`
  - Verify: `pnpm nx test desktop-repositories-feature` passes new cases
- [ ] **T4 (P2, human: ~30min / CC: ~5min)** — ui-file-tree-skeleton —
      Add `ui-file-tree-skeleton.spec.ts` shape snapshot + a11y attrs
  - Surfaced by: Section 3 (Tests)
  - Files: `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.spec.ts`
  - Verify: `pnpm nx test desktop-repositories-ui` passes new cases

**Sequencing:** T1 + T4 are independent (skeleton file + its spec).
T2 + T3 are sequential (feature change before its spec is easiest to
write). T1/T4 and T2/T3 can run in parallel worktrees if desired,
but realistically this is a one-PR slice — ship as a single commit
unit.

## 9. Eng review adjustments — P1.2 + P1.3 (P1.2 ✅ DONE, P1.3 pending)

Locked decisions from `/plan-eng-review` covering P1.2 + P1.3. Anything
here OVERRIDES the corresponding part of §2.2 / §2.3 above. Read this
section before implementing; the upstream §2 text is preserved for
provenance but is partially stale.

### 7.1 Verified-against-code

- P1.3 close-button bug — confirmed at `tab-item.ts:75` (rename + close
  both gated by `kind === 'chat' && !renaming()`).
- `FileTreeCacheStore` is purely in-memory today — confirmed.
- `ChangedFile` TS DTO has no `oldPath` and no `'renamed'` — confirmed.
- `commit.rs:185–187` already collapses renames into ONE row (consumes
  the source path then discards it). The doc's "two rows" claim is
  wrong; the actual gap is just `oldPath` propagation.
- `feature-file-content.ts:463–484` `save()` does NOT trigger any
  Changes-list refresh today — confirmed.
- `tauri-plugin-store` is **not in Cargo.toml**. The existing pattern is
  `withStorageSync` (`@angular-architects/ngrx-toolkit`) writing to
  localStorage, used by `UiStateStore`.
- `FILE_TAB_CAP = 1` is intentional today (`workspace-tab.model.ts:35`).
  Per user direction, the cap is removed (effectively unbounded).
- The middle shell is **router-outlet driven**:
  `workspace-detail.page.ts:82` mounts `<router-outlet/>`; the child
  `WorkspaceTabContent` receives `projectId / workspaceId / tabId` via
  component-input-binding. Its effect at lines 166–176 is the SINGLE
  seam that calls `FileTabsService.openFor` on every navigation. The
  tree, the changes-list, and the chat-tab-bar all navigate; the route
  effect mirrors into the service. The URL is the source of truth for
  the active tab.

### 7.2 P1.2 — Changes tab persistence (adjusted)

| Decision                          | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage layer                     | localStorage via `withStorageSync` (key `mozart-changed-files-v1`). Synchronous read on bootstrap = instant paint. ~3 MB headroom for 50 typical workspaces. Defer `tauri-plugin-store` until needed.                                                                                                                                                                                                                                              |
| Hydration vs. refresh (was a bug) | `CachedChangedFiles` gains `hydratedAt?: number` and `refreshedSinceHydration?: boolean`. The cache-miss effect in `feature-workspace-files.ts:196–214` refreshes when `cached === null` OR `(hydratedAt && !refreshedSinceHydration)`. First in-session refresh sets the flag. This closes the "snapshot stays stale forever" gap that the original short-circuit would create.                                                                   |
| Rename detection                  | Keep porcelain v1 -z. In `commit.rs:185–187`, capture `iter.next()` as `Option<String>` (covers both `R*` AND `C*` per codex review). `classify()` maps `R*` → `Some("renamed")`. Add `pub old_path: Option<String>` to the Rust DTO. Add `'renamed'` to the TS `ChangedFile` status union and `oldPath?: string` on the DTO. Render `<old> → <new>` in the Changes row when `oldPath` present (reuse the arrow already used by `MzFileDiffCard`). |
| Status helper DRY                 | Lift duplicated `statusLetter` + color-class ternaries into `libs/desktop-repositories-util/src/lib/changed-file-status.ts`. Export `changedFileStatusMeta(status) → { letter, colorClass, label }`. Both `feature-changes-list` and `feature-commit-dialog` consume it. Review `tauri-adapters.ts:470` to either include `'renamed'` in the condition or refactor to an exhaustive switch.                                                        |
| RPC failure surface               | `RepositoriesFacade` gains `lastRefreshErrorByWorkspace`. The Changes tab trigger shows a small destructive-tinted alert icon when the most recent refresh failed; clears on next success. Replaces today's silent `console.warn`.                                                                                                                                                                                                                 |
| Manual refresh button             | **Skipped.** Watcher + `softRefreshAfterMutation` + always-refresh-on-activation cover real cases. Captured as TODO if users report stale lists.                                                                                                                                                                                                                                                                                                   |

### 7.3 P1.3 — File tabs (adjusted)

| Decision                                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FILE_TAB_CAP                            | **Removed.** Cap → effectively unbounded. Tab bar already has horizontal-scroll overflow (`workspace-tab-bar.ts:67–72`). Only the active tab mounts CodeMirror (lazy `@defer` at `feature-file-content.ts:194`). Route encoding is per-active-tab only — no URL bloat.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tab persistence                         | Add `fileTabsByWorkspace: Record<wsId, { open: { path }[] }>` slice to `UiStateStore`; persist via existing `withStorageSync` block (key `mozart-ui-state-v1`). `FileTabsService` stays the public API but delegates open/close to `UiStateFacade`. `activeByWorkspace` is NOT persisted — it's downstream of the URL; route activation restores it.                                                                                                                                                                                                                                                                                                                     |
| Preview / pin model                     | Tabs gain `isPreview: boolean` (in-memory only; **NOT persisted** — on hydrate all tabs come back as `isPreview: false`). New methods: `previewFor(ws, path)` (one preview slot per workspace; next call replaces the existing slot's path) and `pinFor(ws, path)` (append if absent; flip preview→pinned if open; focus if already pinned).                                                                                                                                                                                                                                                                                                                             |
| Intent threading (CROSS-MODEL ADJUSTED) | Per codex outside voice: **DO NOT** put `intent` in the URL. Use `Router.navigate(commands, { state: { intent: 'preview' }, replaceUrl: true })` for tree single-click. Tree double-click + Changes-list click navigate without state (= pin). `WorkspaceTabContent` effect reads `history.state?.intent ?? 'pin'` and calls `previewFor` or `pinFor`. `replaceUrl: true` on preview prevents history-entry pollution. URLs stay clean; deep-links always pin.                                                                                                                                                                                                           |
| Click discrimination                    | Native `(click)` + `(dblclick)` bindings on `FileTreeRow` — NO `setTimeout` debounce. Accept the brief italic→non-italic visual on a real double-click (preview navigate then pin navigate target the same path; the second pinFor flips the existing preview slot's `isPreview=false`).                                                                                                                                                                                                                                                                                                                                                                                 |
| Close button regression fix             | In `tab-item.ts:75`, move the close button out of the `kind === 'chat' && !renaming()` guard. Rename pen stays chat-only. Test (regression-class, mandatory): `showClose=true && tab.kind === 'file'` renders the × button.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Auto-pin on edit (CROSS-MODEL ADJUSTED) | Per codex: do NOT pin on raw `valueChange` — CodeMirror emits on initial model dispatch under `@defer`, which would spuriously pin every preview tab. Instead, run an `effect` that watches `dirty()` flipping `false → true` and calls `pinFor(active.path)` only when the active tab is a preview. The initial editor emit has `value === baseline()` so `dirty` stays false; the first real keystroke flips it.                                                                                                                                                                                                                                                       |
| Save → Changes sync                     | Lift the current `softRefreshAfterMutation` (private in `feature-changes-list.ts:295–302`) into a **feature-internal** free function at `libs/desktop-workspaces-feature/src/lib/util-soft-refresh.ts`: `softRefreshAfterMutation(ws, repos, workspaces, fileViews)`. Stays inside the feature lib (feature → feature is allowed); both `feature-changes-list` and the `save()` success path in `feature-file-content.ts` import via relative path. NOT a `type:util` lib — the function takes facade refs whose types live in data-access, which would violate util boundary rules. Skip the call on `saveError.kind === 'frozen' \| 'stale'` (no successful mutation). |
| File-content auto-pin file lookup       | `FileTabsService` gains a small helper `findTab(ws, path)` so `feature-file-content` can check `isPreview` without crossing layers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 7.4 TODOs captured

Captured in `TODOS.md`:

- **Manual refresh button on Changes header** — skipped; reconsider if users report stale lists.
- **Throttle on snapshot writes** — only matters on 500+ changed-file workspaces; measure first with Performance > Long Tasks panel before adding `throttle: 500` to `withStorageSync`.
- **Proactive stale-tab-path prune on activation** — relying on the existing open-time error UX (`feature-file-content.ts:121–139` shows "Couldn't open file" with Retry).
- **localStorage quota-exceeded UX** — `withStorageSync` swallows `QuotaExceededError` today. Add a defensive try/catch + a one-time "your tab/snapshot state hit the storage cap" toast.
- **Multi-window contention** — `tauri-plugin-single-instance` is wired today so this is N/A in v0.1.0-beta.1. When Mozart spawns secondary windows, `withStorageSync` will need `storage` event listening or a leader-election strategy.
- **True Playwright + Tauri-webdriver E2E** — defer; covered by Angular component integration tests for v1.
- **FILE_TAB_CAP soft ceiling** — codex called out the unbounded risk. Add a soft cap (e.g. 100) with FIFO eviction once we see real session sizes.
- **C\* (copy) status semantics** — `parse_porcelain` consumes copy source identically to rename; surface as `'renamed'` for v1 (functionally equivalent for the UI). Revisit if/when we add explicit copy semantics.

### 7.5 Test coverage diagram (P1.2 + P1.3)

Captured separately in
`~/.gstack/projects/t1m4lc-mozart/timothy-wt-p1.2-eng-review-test-plan-20260524-172002.md`
(test plan artifact for `/qa` and `/qa-only` consumption).

53 total gaps across both items, 3 mandatory regression tests
(close-button visibility, rename `oldPath` propagation, save→Changes
soft-refresh call). Coverage chosen at the Angular component
integration level; no E2E framework added in this PR.

### 7.6 What already exists (don't rebuild)

- `FileTreeCacheStore`'s revision-tracked staleness check + atomic
  swap pattern — reuse for the new `hydratedAt` semantics.
- `withStorageSync` from `@angular-architects/ngrx-toolkit` is already
  vetted on `UiStateStore` — same pattern, same key family.
- `FileTabsService.closeFor` + neighbor-fallback wiring at
  `feature-chat-tab-bar.ts:101–109` already routes file-tab closes.
  No template wiring changes needed beyond the regression fix.
- `RepositoriesFacade.refreshChangedFilesInBackground` already does
  the atomic swap. `softRefreshAfterMutation`'s lift is pure code
  movement, no new RPC.
- `MzFileDiffCard` already has `'renamed'` + `oldPath` support
  (`mz-file-diff-card.ts:37, 316, 368`) — only the upstream DTO chain
  was lossy. Reuse the arrow rendering.
- `parse_porcelain` tests at `commit.rs:245–268` are the template for
  the new rename test.

### 7.7 NOT in scope

- Multi-file review surface itself (the chrome variant on
  `MzFileDiffCard` is P1.4, not P1.3).
- Workspace status state machine changes (P1.1 scope).
- File-header refactor / dropping `FeatureFileToolbar` (P1.4).
- Composer mount on file tabs (P2.2).
- Drag-reorder of file tabs.
- Multi-window state coordination (single-instance app today).
- Replacing watcher debounce semantics; Rust-side `spawn_watcher`
  keeps its current behavior.
- True cross-process E2E framework — see TODO entry.

### 7.8 Failure modes (P1.2 + P1.3)

| Path                                                                     | Test?                             | Error handling?                          | User-visible?                               |
| ------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------- | ------------------------------------------- |
| `listChangedFiles` RPC fails on activation                               | unit                              | inline alert icon (new)                  | YES                                         |
| `git mv` rename detection misses on edge cases                           | rust unit (new)                   | falls through to plain `modified`        | low                                         |
| localStorage `QuotaExceededError`                                        | not in this PR                    | swallowed by withStorageSync             | silent — **critical gap**, captured as TODO |
| Preview tab path stale after reload                                      | manual + open-time UX             | "Couldn't open file" banner              | YES                                         |
| `save()` while `saveError.kind === 'stale'` triggers soft-refresh anyway | unit                              | guarded: only on success                 | low                                         |
| Double-click → two history entries                                       | unit (workspace-tab-content spec) | `replaceUrl: true` on preview navigation | none after fix                              |
| Editor initial emit pins preview spuriously                              | unit (effect on dirty())          | dirty-based guard                        | none after fix                              |

**Critical gap**: localStorage quota exceeded is silent today. Capture
in TODOs; not blocking for v1 ship.

### 7.9 Worktree parallelization strategy

| Step                                      | Modules touched                                                                                                                                                                                                                                                                                                                                 | Depends on |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1.3a (close button)                      | `libs/desktop-workspaces-ui/` (tab-item)                                                                                                                                                                                                                                                                                                        | —          |
| P1.3b (preview/pin + persist + save sync) | `libs/desktop-workspaces-data-access/` (file-tabs.service), `libs/desktop-workspaces-util/` (workspace-tab.model), `libs/desktop-ui-state-data-access/`, `libs/desktop-workspaces-ui/` (tab-item italic), `libs/desktop-workspaces-feature/` (workspace-tab-content, feature-workspace-files navigate, feature-file-content, util-soft-refresh) | P1.3a      |
| P1.2 (persist + rename)                   | `libs/desktop-repositories-data-access/` (file-tree-cache, repositories.adapter), `libs/desktop-repositories-util/` (changed-file-status), `libs/desktop-workspaces-feature/` (feature-workspace-files stale-hydration effect, feature-changes-list), `apps/desktop-tauri/src/commit.rs`                                                        | —          |

**Lanes:**

- **Lane A:** P1.3a (close button) — independent, ships first as smallest user-visible win.
- **Lane B:** P1.2 (Changes persistence + rename) — independent of A and C.
- **Lane C:** P1.3b (preview/pin + persistence + save sync) — depends on A.

**Execution order:** Launch **A and B in parallel** worktrees. After A merges, launch **C** (touches the same `feature-workspace-files.ts` file as B for navigate calls — second lander rebases).

**Conflict flag:** Lanes B and C both touch `libs/desktop-workspaces-feature/.../feature-workspace-files.ts`. B adds the stale-hydration refresh effect; C changes the tree-click handler to navigate with `state: { intent }` extras. Trivial merge conflict; coordinate by rebasing C onto B's merge commit.

### 7.10 Outside voice (codex) — items folded into this plan

- Intent encoding: switched from `?intent=preview` query param to `Router.navigate(..., { state: { intent }, replaceUrl: true })` (7.3).
- Auto-pin race: switched from raw `valueChange` to `dirty()`-based effect (7.3).
- C\* (copy) treatment: folded into 7.2's rename branch.
- `replaceUrl: true` on preview navigation: folded into 7.3.

Codex items captured as TODOs (not blocking): quota-exceeded UX,
multi-window contention, FILE_TAB_CAP soft ceiling.

### 7.11 Sequencing recommendation (updated)

1. **P1.3a — close-button regression fix** (smallest, highest value, 1 file)
2. **P1.2 — Changes persistence + rename** (independent; can ship in parallel with 1)
3. **P1.3b — preview/pin + tab persistence + save sync** (depends on 1; conflicts with 2 on one file)

P1.1, P1.4, P2.\* unchanged from §6.

## 10. /plan-eng-review notes — P2.4 + P2.5 ✅ DONE

### 7.1 NOT in scope (P2.4 + P2.5)

- Function-scope suffix preservation (`@@ ... @@ class FooBar:`) — deferred to TODOS.md "Diff view — function-scope suffix on hunk row (post P2.4)".
- ExpandBarWidget spec coverage — deferred to TODOS.md "Diff view — spec coverage for trailing-gap ExpandBarWidget". Folded into the new spec file's home so future pickup is cheap.
- Shared abstraction for `ExpandBarWidget` + `HunkButtonMarker` — both are visual cousins but extend different CodeMirror base classes (`WidgetType` vs `GutterMarker`). Coupling them is over-engineering for two callsites.
- Down/both direction support on the per-hunk gutter button — the button only operates "up" by design; trailing-gap and bidirectional cases stay with `ExpandBarWidget`.
- Visual regression / screenshot tests for diff view — no screenshot harness exists in this repo today; not in scope to add one.

### 7.2 What already exists (reused by P2.4 + P2.5)

- `DiffHunk.{oldStart, oldCount, newStart, newCount}` — parsed numbers ready in `diff-parser.ts:20–41`. No parser change needed.
- `RenderItem.hunk-header` carries `gapIndex` + `linesAvailable` — `mz-diff-view.ts:88–98`.
- `gapRemaining()` in `mz-diff-view.ts:593–608` already computes the lookahead `linesBelow` value §2.8 needs.
- `HUNK_EXPAND_STEP = 20` constant — `cm-diff-extensions.ts:49`. Key all "20" text off this.
- `HunkButtonMarker.eq()` already keys off `gapIndex + linesAvailable` — re-renders on count change for free.
- `lucideChevronUp` icon — already imported and used; reuse for the wider button.
- `ExpandBarWidget` (lines 269–334) — the labelled-strip visual pattern P2.5 mirrors. Look at its `makeBtn` factory for the title/disabled/shift-doubles structure before re-implementing.

### 7.3 Failure modes

| Codepath                                       | Failure scenario                                                                                            | Has test?              | Has handling?    | Silent?                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------- | -------------------------------- |
| `buildDocPlan` hide-on-both-empty              | Lookahead computes wrong `linesBelow`; row hides when it shouldn't, or stays when it should hide.           | yes (§2.8.1 cases 5–7) | n/a (pure)       | no — visible UX                  |
| `buildDocPlan` hide-on-both-empty              | Gutter alignment breaks because lineMeta length stays in sync with doc but downstream consumer assumed N+1. | partial (case 8)       | n/a              | no — visible misalignment        |
| `buildLineDecorations` title decoration        | Title attr fails to render via `Decoration.line({ attributes: { title } })`.                                | yes (case 9)           | n/a              | yes — fall back: no tooltip      |
| `HunkButtonMarker.toDOM` wider hit target      | Wider button overflows the gutter on the left, clipped by parent.                                           | no (visual)            | css; manual QA   | no — visible overflow            |
| `HunkButtonMarker.toDOM` count badge           | Badge text not in sync with `linesAvailable` after rapid clicks.                                            | n/a (eq covers)        | `eq` rebuild     | no — would show wrong number     |
| `HunkButtonMarker.toDOM` shift-click           | Wider DOM intercepts shiftKey wrong; only single step expands.                                              | yes (case 16)          | n/a              | yes — silent regression to 1×    |

**Critical gaps:** none. The closest is the wider-button overflow risk (no automated test, only css + manual QA) but the failure is visually obvious in dev — not silent.

### 7.4 Worktree parallelization strategy

Sequential implementation, no parallelization opportunity. P2.4 and P2.5 both edit `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts`. They also share the new `cm-diff-extensions.spec.ts`. Land in one PR slice; they're a single coherent design.

### 7.5 Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~1h / CC: ~8min)** — `cm-diff-extensions.ts` — Add `formatHunkLabel` helper + `LineMeta.originalHeader` field
  - Surfaced by: §2.8 Implementation notes (label formatter contract).
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts`
  - Verify: unit test cases 1–3 from §2.8.1.

- [ ] **T2 (P1, human: ~2h / CC: ~12min)** — `cm-diff-extensions.ts` — `buildDocPlan` hide-on-both-empty + label swap
  - Surfaced by: Architecture decision D3 (hide row when both adjacent gaps empty).
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:131–140` + header comment block at lines 76–87.
  - Verify: unit test cases 4–8 from §2.8.1; manual: multi-hunk diff with one fully-expanded mid-hunk → row disappears.

- [ ] **T3 (P1, human: ~45min / CC: ~6min)** — `cm-diff-extensions.ts` — `buildLineDecorations` title decoration on hunk rows
  - Surfaced by: Architecture decision D2 (replace text + tooltip with raw `@@`).
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:235–237`.
  - Verify: unit test cases 9–11; manual: hover hunk row → tooltip shows raw `@@`.

- [ ] **T4 (P1, human: ~1.5h / CC: ~10min)** — `cm-diff-extensions.ts` — `HunkButtonMarker.toDOM` wider hit target + count badge
  - Surfaced by: §2.9 P2.5 implementation.
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:478–532`.
  - Verify: unit test cases 12–16; manual: button visibly wider, `+20` badge renders, doesn't overflow gutter.

- [ ] **T5 (P1, human: ~3h / CC: ~20min)** — Create `cm-diff-extensions.spec.ts` with ≥14 cases
  - Surfaced by: §2.8.1 + D4 (full coverage required).
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.spec.ts` (new).
  - Verify: `pnpm nx test diff-view` passes; coverage report shows non-zero lines in `cm-diff-extensions.ts`.

- [ ] **T6 (P2, human: ~10min / CC: ~3min)** — Update header comment diagram at `cm-diff-extensions.ts:76–87`
  - Surfaced by: §2.8 risks/notes (diagram maintenance per CLAUDE.md rule).
  - Files: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:76–87`.
  - Verify: comment accurately reflects "hunk row's doc text is a human label; raw `@@` is on the line's title attr; row hides when both adjacent gaps empty."

### 7.6 Completion summary (P2.4 + P2.5)

- Step 0: Scope Challenge — scope accepted as-is (1 file, 0 new classes, no STOP gate).
- Architecture Review: 3 issues raised, all decided (label/button split, label rendering mechanism, label content).
- Code Quality Review: 0 issues requiring user decision; constants reuse + diagram maintenance folded into plan inline.
- Test Review: coverage diagram produced, 16 gaps identified, full new spec file required (D4).
- Performance Review: 0 issues.
- NOT in scope: 5 items listed in §7.1.
- What already exists: 7 items listed in §7.2.
- TODOS.md updates: 2 items added (function-scope suffix, ExpandBarWidget tests).
- Failure modes: 0 critical gaps flagged (table in §7.3).
- Outside voice: skipped per user.
- Parallelization: sequential — both items edit the same file; one PR slice.
- Lake Score: 4/4 recommendations chose the complete option (full spec coverage, hide-on-both-empty refinement, decorate-with-title for tooltip, defer scope suffix as TODO not omitted).

---

## 11. Eng review adjustments — P1.3 (re-run 2026-05-24)

Second `/plan-eng-review` pass on P1.3 specifically, run after P1.2 shipped.
Decisions here OVERRIDE the corresponding parts of §2.3 and §9.3. Read this
section before implementing P1.3b; the earlier §2.3 / §9.3 text is preserved
for provenance but partially stale.

### 11.1 Verified-against-code (this run)

- `tab-item.ts:75` still gates close × on `kind === 'chat' && !renaming()` — bug confirmed.
- `FILE_TAB_CAP = 1` at `workspace-tab.model.ts:35` — confirmed.
- `FileTabsService.openFor` (`:47–61`) still trims via `FILE_TAB_CAP` — confirmed.
- `feature-file-content.ts:469–490` `save()` still does NOT trigger any Changes refresh — confirmed.
- `softRefreshAfterMutation` is private at `feature-changes-list.ts:295–302` — confirmed.
- `feature-workspace-files.ts:276–291` and `feature-changes-list.ts:304–319` are near-duplicate open helpers — confirmed (this review adds a `navigateToFileTab` helper to collapse them).
- `WorkspaceTabContent`'s effect at `workspace-tab-content.ts:197–207` is the single seam between URL and `FileTabsService` — confirmed.
- `WorkspaceTabResolver.defaultChatTabId` (`workspace-tab-resolver.service.ts:82–97`) always routes to chat; never restores last-active file tab — confirmed.
- No `file-tabs.service.spec.ts`, no `tab-item.spec.ts` today — confirmed.
- Pre-prod app: no localStorage migration burden (user-confirmed).

### 11.2 P1.3 decisions (D-rerun)

| ID  | Topic | Choice | Implication |
| --- | ----- | ------ | ----------- |
| D-r1 | Multi-tab unsaved-edits loss on tab switch | **Lift cap + add draft persistence in same PR** | `FeatureFileContent`'s `linkedSignal` for `editorValue` resets on `filePath` change, blowing away unsaved edits on tab switch when cap=1 is removed. Solution: hydrate `editorValue` from a draft store on filePath change; write drafts on edit. Lake-style — multi-tab works without data loss. |
| D-r2 | Intent capture (`history.state` re-fire + back-nav semantics) | **RxJS `Router.events` NavigationEnd subscription → `toSignal`** | Replace the bare effect-on-`tab()` read of `history.state`. Subscribe to NavigationEnd, extract `extras.state.intent`, expose via `toSignal`. Effect for the FileTabsService mutation reads the signal. Aligns with CLAUDE.md ("Prefer `computed()` / `linkedSignal()` over `effect()`; for async use RxJS"). |
| D-r3 | `fileViewStateByWorkspace` single-active shape vs multi-tab | **Reshape to `Record<wsId, Record<path, FileFlowState>>`** | Each file remembers its own mode/splitDiff. Active path derived from URL. No in-place migration (pre-prod). |
| D-r4 | `softRefreshAfterMutation` home | **New `WorkspaceMutationsFacade` in `workspaces-data-access`** | Owns post-mutation choreography. Cross-domain calls live in the facade where they belong. Callers inject + call one method. Both `feature-changes-list` (stage/discard) and `feature-file-content` (save) consume it. |
| D-r5 | DRY: `openFileFromAllFiles` vs `openFileFromChanges` | **`FileTabsService.navigateToFileTab(ws, path, opts)`** | Wraps tabId construction + uiState write + `router.navigate` + intent state extras. Both call sites collapse to one line. Single tested helper. |
| D-r6 | Auto-pin via `dirty()` flip — Cmd-Z re-type race | **`hasAutoPinned` linkedSignal per-(ws,path); reset on resetKey** | Effect calls `pinFor` ONLY on first `false → true` dirty edge per tab lifetime; subsequent flips (undo/redo) are no-ops. ~6 LOC. |
| D-r7 | Per-workspace last-active tab persistence (user-added requirement) | **`lastActiveTabIdByWorkspace` slice on `UiStateStore`; resolver prefers it** | Persist last-active tabId (chat OR file kind) per workspace via `withStorageSync`. `WorkspaceTabContent` writes on every tab transition. `WorkspaceTabResolver.defaultChatTabId` → rename `defaultTabId`; if persisted last-active parses + `authorize` passes, return it; else fall back to existing chat logic. Stale file path → trust the URL; existing `FeatureFileContent` "Couldn't open file" banner handles it (no extra RPC). |
| D-r8 | Test scope | **Full lake: ~57 cases across 8 spec files + 4 E2E TODOs** | All preview/pin/persistence/auto-pin/draft/last-active paths covered. R1–R6 regressions mandatory. Aligns with D-r1 completeness. |
| D-r9 | Storage layout: reshape `mozart-ui-state-v1` or split? | **Split into separate keys (no migration)** | New keys: `mozart-file-tabs-v1` for tabs + last-active; `mozart-file-views-v1` for per-path mode; `mozart-drafts-v1` for drafts (worker-owned key). `mozart-ui-state-v1` keeps aside/tree state intact. Each slice owns its lifecycle; clean separation; no in-place migration code. |
| D-r10 | Draft write cadence (perf) | **Separate `mozart-drafts-v1` key + Web Worker write** | Move drafts out of the main UI state blob into a dedicated key; serialize + persist via worker so main-thread typing on large files isn't blocked. Bounded data loss on hard crash = last unflushed batch. Worker also keeps headroom for future compression (TODO). |

### 11.3 What already exists (don't rebuild — this review)

- `FileTabsService.closeFor` + neighbor fallback (`file-tabs.service.ts:68–86`) — close logic works; bug is template-side only.
- `feature-chat-tab-bar.ts:91–135` already routes file closes through `fileTabs.closeFor`.
- `WorkspaceTabRegistry.fileTabId` + base64url path encoding (`workspace-tab-registry.ts:127–131`).
- `withStorageSync` from `@angular-architects/ngrx-toolkit` — already vetted on `UiStateStore`. New keys reuse the same pattern.
- `RepositoriesFacade.refreshChangedFilesInBackground` already atomic-swaps the cache.
- `WorkspaceTabResolver.authorize` returns `true` for file kinds — stale path falls through to existing `FeatureFileContent` "Couldn't open file" banner.
- `linkedSignal` reset-on-key pattern at `feature-file-content.ts:282` — clean precedent for `autoPinned` flag.
- `Router.events` + `toSignal` — Angular 22 supports `state` extras + `toSignal` wrapping cleanly.
- `pruneWorkspace` (`ui-state.store.ts:245–257`) — extend to also drop `fileTabsByWorkspace`, the per-path file view map, `lastActiveTabIdByWorkspace`, and drafts.

### 11.4 NOT in scope (P1.3 — this run additions to §5)

- **Persisted preview state across reload** — preview is intentionally ephemeral; restored tabs all come back as pinned.
- **Drag-reorder of file tabs** — §9.4 captured.
- **Soft cap (e.g., 100) with FIFO eviction** — §9.4 captured as TODO; risk surfaces only at extreme tab counts.
- **Multi-window draft contention** — Mozart is single-instance today (§9.4); when multi-window lands, draft writes will need leader-election or storage-event listening. New TODO added below.
- **IndexedDB migration for drafts** — Web Worker + localStorage carries us until per-file drafts exceed quota; IndexedDB lands when needed.
- **Eager mount of CodeMirror for non-active tabs** — `@defer (when mode() === 'edit')` keeps inactive tabs cheap.
- **`File` icon variant per extension** — unrelated polish.
- **Composer-on-file-tab beyond send/stop** — P2.2 boundary.
- **Stale-path Tauri `file_exists` precheck in resolver** — chose to trust the URL (existing banner UX), per D-r7.
- **`mozart-ui-state-v1` → v2 reshape with migration** — split-key approach (D-r9) avoids it; pre-prod also means no users to migrate.

### 11.5 TODOs captured (new, in addition to §9.4)

- **Drafts compression for very large files** — Web Worker write handles the synchronous-stall concern. Compression (e.g., gzip via `fflate`, or LZ-string) extends localStorage headroom for multi-MB drafts. Speculative until a real user hits it.
- **`WorkspaceMutationsFacade` horizon** — opportunistically migrate other post-mutation choreography (post-merge, post-PR-create, post-branch-switch) into the new facade when their flows are touched.
- **Multi-window draft contention** — when secondary windows land, two windows editing the same file will race-overwrite drafts. Design: storage events + leader election OR window-scoped draft keys. §9.4 mentions the general multi-window concern; this is the draft-specific instance.

### 11.6 Failure modes (this run)

| Codepath | Failure | Test? | Error handling? | User-visible? |
| -------- | ------- | ----- | --------------- | ------------- |
| `tab-item` close × on file tab | template gate fix — no failure surface | T17 (R1) | n/a | close × visible on hover, click closes |
| `FileTabsService.previewFor` slot replace | concurrent calls | T18 | signals patch sync; last-writer-wins | replaced tab disappears, new takes slot — correct |
| `FileTabsService.pinFor` already-pinned | idempotency | T18 | sync compute; activate only | no visible change |
| Auto-pin on dirty edge (Cmd-Z re-type) | `hasAutoPinned` not reset between files | T22 | reset on `resetKey` (workspaceId|filePath change) | none — guard intact |
| Draft hydrate on `filePath` change | stale draft + baseline mismatch | T22 | linkedSignal initial reads draft-or-baseline; first save baselines | restored unsaved edits show as dirty, save works |
| Draft write via Worker | worker crash mid-write | T18 (worker mock) | swallow + console.warn + fall back to in-memory next time | drafts in-memory only until worker restarts — silent until reload |
| `WorkspaceMutationsFacade.softRefreshAfterMutation` | one fan-out RPC fails | T20 | existing try/catch on fileViews; others tolerate via cache-and-swap | partial refresh; recovers on next watcher tick |
| `save()` → softRefresh | mutations facade injection fails | T22 | DI throws on construction | clear dev-console error; broken shell |
| `WorkspaceTabContent` intent capture | NavigationEnd fires before tab() updates | T21 | `toSignal` + dep on `tab()` in effect captures both atomically | tab opens with correct intent |
| `WorkspaceTabResolver.defaultTabId` stale file path | last-active is a deleted file | T23 + manual | trust-the-URL → `FeatureFileContent` banner | "Couldn't open file" banner with Retry |
| `ui-state.store` split-keys hydrate | one key missing/corrupt | T19 | per-key default-on-miss | resets only that slice, others intact |
| `FileTabsService` cap removal | memory grows with 100s of tabs | not tested | manual + soft-cap TODO from §9.4 | gradual perf degradation if user keeps opening tabs |

**Critical gaps:** none. Worker-write silent failure is the closest (data loss on reload after worker crash), but it's well-bounded by the in-memory fallback and a hard crash is the only realistic trigger.

### 11.7 Worktree parallelization strategy

| Lane | Modules touched | Depends on |
| ---- | --------------- | ---------- |
| A — close button + italic + dead-cap | `workspaces-ui` (tab-item), `workspaces-util` (workspace-tab.model) | — |
| B — data layer | `workspaces-data-access` (file-tabs.service, NEW workspace-mutations.facade), `ui-state-data-access` (ui-state.store, ui-state.facade) | — |
| C — feature integration | `workspaces-feature` (workspace-tab-content, feature-file-content, feature-workspace-files, feature-changes-list), `workspaces-data-access` (workspace-tab-resolver.service), `repositories-feature` (feature-file-tree), `repositories-ui` (ui-file-tree-row) | B |
| D — drafts worker infra | NEW worker module under `desktop-ui-state-data-access` (or `mozart-ui/util` if it grows) | B (for the UiStateFacade integration point) |

**Execution order:** Launch **A** in parallel with **B**. Launch **D** in parallel with **B** (separate file, no overlap). Launch **C** after **B** merges (C consumes the new facade + selectors). C and D each merge independently after they land their respective integration points.

**Conflict flag:** Lane B and Lane C both touch `UiStateFacade` selectors. B adds the new selectors; C consumes them. Sequence C after B so the second lander rebases cleanly.

### 11.8 Implementation tasks (P1.3 — this run)

Synthesized from this review's findings. Run with Claude Code or Codex;
checkbox as you ship. JSONL artifact for `/autoplan` aggregation:
`~/.gstack/projects/t1m4lc-mozart/tasks-eng-review-20260524-211325.jsonl`
(25 tasks).

- [ ] **T1 (P1, human: ~10min / CC: ~3min)** — `workspaces-ui` — `tab-item`: move close `×` out of `kind === 'chat' && !renaming()` guard (**R1 regression**); rename pen stays chat-only
  - Surfaced by: §11.2 D-r2 (architecture); user-flagged close-button bug
  - Files: `libs/desktop-workspaces-ui/src/lib/tab-item.ts`
  - Verify: T17 spec; manual hover on file tab → close × appears
- [ ] **T2 (P1, human: ~30min / CC: ~5min)** — `workspaces-ui` — `tab-item`: add `italic` Tailwind class when `tab.kind === 'file' && tab.isPreview`
  - Surfaced by: §2.3 plan target — preview tab visual
  - Files: `libs/desktop-workspaces-ui/src/lib/tab-item.ts`
  - Verify: T17 spec; manual single-click tree → italic title
- [ ] **T3 (P1, human: ~10min / CC: ~2min)** — `workspaces-util` — remove `FILE_TAB_CAP` constant + `MAX_TABS` dead alias
  - Surfaced by: §9.3 D-FILE_TAB_CAP — cap removed → constant is dead code
  - Files: `libs/desktop-workspaces-util/src/lib/workspace-tab.model.ts`
  - Verify: build passes (no remaining imports); grep -r `FILE_TAB_CAP` returns no source refs
- [ ] **T4 (P1, human: ~15min / CC: ~3min)** — `workspaces-util` — `FileTab` gains `isPreview: boolean`
  - Surfaced by: §2.3 + §9.3 preview/pin model
  - Files: `libs/desktop-workspaces-util/src/lib/workspace-tab.model.ts`
  - Verify: types compile; `feature-chat-tab-bar.ts` maps the field through
- [ ] **T5 (P1, human: ~3h / CC: ~20min)** — `workspaces-data-access` — `FileTabsService` rewrite: `previewFor`, `pinFor`, `openFor` (back-compat → pinFor), `findTab`, `navigateToFileTab`; persistence delegation to UiStateFacade; draft buffer plumbing (read/write/clear)
  - Surfaced by: §11.2 D-r1, D-r5, D-r6 + §9.3 preview/pin model
  - Files: `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.ts`
  - Verify: T18 spec (18 cases including R3)
- [ ] **T6 (P1, human: ~1h / CC: ~10min)** — `ui-state-data-access` — `UiStateStore`: split keys — `mozart-ui-state-v1` unchanged, new `mozart-file-tabs-v1` (tabs + lastActive), new `mozart-file-views-v1` (per-path mode), new `mozart-drafts-v1` (drafts, worker-owned); reshape `fileViewStateByWorkspace` to `Record<wsId, Record<path, FileFlowState>>`; add `fileTabsByWorkspace`, `lastActiveTabIdByWorkspace`, `drafts` slices; extend `pruneWorkspace` to clear all new slices
  - Surfaced by: §11.2 D-r3, D-r7, D-r9
  - Files: `libs/desktop-ui-state-data-access/src/lib/ui-state.store.ts`
  - Verify: T19 spec (12 cases including R5)
- [ ] **T7 (P1, human: ~2h / CC: ~15min)** — `ui-state-data-access` — `UiStateFacade` selectors: `fileViewStateForPath(ws, path)`, `lastActiveTabIdFor(ws)`, `fileTabsFor(ws)`, draft CRUD; setters: `setLastActiveTab`, `setFileTabs`, `writeDraft`/`readDraft`/`clearDraft`
  - Surfaced by: §11.2 D-r3, D-r7
  - Files: `libs/desktop-ui-state-data-access/src/lib/ui-state.facade.ts`
  - Verify: types compile; T19 store spec covers underlying patches
- [ ] **T8 (P1, human: ~3h / CC: ~20min)** — `workspaces-data-access` — NEW `workspace-mutations.facade.ts`: `softRefreshAfterMutation(workspaceId)` fans out to `RepositoriesFacade.refreshTreeInBackground` + `refreshChangedFilesInBackground` + `WorkspacesFacade.refreshDiffStats` + `FileViewsFacade.refresh`
  - Surfaced by: §11.2 D-r4
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace-mutations.facade.ts` (NEW), `libs/desktop-workspaces-data-access/src/index.ts`
  - Verify: T20 spec (5 cases)
- [ ] **T9 (P1, human: ~1h / CC: ~10min)** — `workspaces-feature` — `feature-changes-list`: delegate stage/discard refresh to `WorkspaceMutationsFacade.softRefreshAfterMutation`; drop private helper
  - Surfaced by: §11.2 D-r4
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-changes-list.ts`
  - Verify: existing manual stage/discard still triggers Changes list refresh
- [ ] **T10 (P1, human: ~3h / CC: ~20min)** — `workspaces-feature` — `feature-file-content`: auto-pin effect with `hasAutoPinned` linkedSignal guard; hydrate `editorValue` from `UiStateFacade.readDraft` on filePath change (replacing the `linkedSignal(() => '')`); write draft on `editorValue` change; save success → `mutations.softRefreshAfterMutation` + `clearDraft`; `saveError.kind === 'stale' | 'frozen'` short-circuits the refresh (**R2 + R4 regressions**)
  - Surfaced by: §11.2 D-r1, D-r4, D-r6
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-file-content.ts`
  - Verify: T22 spec (10 cases including R2, R4)
- [ ] **T11 (P1, human: ~1h / CC: ~10min)** — `repositories-ui` — `FileTreeRow`: add `(fileDoubleClick)` output via native `(dblclick)` binding (no setTimeout debounce per §9.3)
  - Surfaced by: §9.3 click discrimination
  - Files: `libs/desktop-repositories-ui/src/lib/ui-file-tree-row.ts`
  - Verify: T24 spec
- [ ] **T12 (P1, human: ~30min / CC: ~5min)** — `repositories-feature` — `FeatureFileTree`: forward `(fileDoubleClick)` upward
  - Surfaced by: §9.3 click discrimination
  - Files: `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts`
  - Verify: types compile; bubbled output reaches `FeatureWorkspaceFiles`
- [ ] **T13 (P1, human: ~2h / CC: ~15min)** — `workspaces-feature` — `feature-workspace-files` + `feature-changes-list`: replace inline open helpers with `FileTabsService.navigateToFileTab(ws, path, { intent })`; tree single-click → `intent: 'preview'`, tree double-click + Changes-list click → `intent: 'pin'`
  - Surfaced by: §11.2 D-r5
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-workspace-files.ts`, `libs/desktop-workspaces-feature/src/lib/feature-workspace-files/feature-changes-list.ts`
  - Verify: T18 covers the service helper; manual: tree click → italic, dblclick → pinned
- [ ] **T14 (P1, human: ~3h / CC: ~25min)** — `workspaces-feature` — `workspace-tab-content`: replace effect-on-`tab()` with (a) RxJS `Router.events` → `NavigationEnd` → `map(intent)` → `toSignal` intent capture, (b) effect that dispatches FileTabsService mutation (previewFor/pinFor/setActiveChat) AND writes `UiStateFacade.setLastActiveTab(ws, tab.tabId)` on every transition
  - Surfaced by: §11.2 D-r2, D-r7
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-tab-content.ts`
  - Verify: T21 spec (6 cases)
- [ ] **T15 (P1, human: ~2h / CC: ~15min)** — `workspaces-data-access` — `WorkspaceTabResolver`: rename `defaultChatTabId` → `defaultTabId`; first check `UiStateFacade.lastActiveTabIdFor(ws)`; if it parses + `authorize` passes, return it; else fall back to existing chat-default logic (**R6 regression**)
  - Surfaced by: §11.2 D-r7
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace-tab-resolver.service.ts`
  - Verify: T23 spec
- [ ] **T16 (P1, human: ~2h / CC: ~15min)** — `ui-state-data-access` — NEW drafts Web Worker: serialize + write `mozart-drafts-v1` off-main-thread; the UiStateFacade draft setters post to the worker; reads stay synchronous from the in-memory mirror
  - Surfaced by: §11.2 D-r10 (perf)
  - Files: `libs/desktop-ui-state-data-access/src/lib/drafts-worker.ts` (NEW), worker bootstrap in `ui-state.facade.ts`
  - Verify: T18 worker-mock cases (write success, write fail → in-memory fallback warned)
- [ ] **T17 (P1, human: ~1h / CC: ~10min)** — `workspaces-ui` test — NEW `tab-item.spec.ts`: chat-single hides ×, chat-multi shows ×, **file shows × (R1)**, italic on preview file tab, rename pen stays chat-only
  - Surfaced by: §11.2 D-r8 + R1 regression
  - Files: `libs/desktop-workspaces-ui/src/lib/tab-item.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-ui` passes new cases
- [ ] **T18 (P1, human: ~3h / CC: ~25min)** — `workspaces-data-access` test — NEW `file-tabs.service.spec.ts` (~18 cases): previewFor (empty / replace existing / promote-existing-pin), pinFor (open new / flip preview→pin / activate-already-pinned), closeFor (**R3 no eviction**, neighbor fallback, draft + preview-slot clear), findTab, navigateToFileTab (state extras present/absent), drafts CRUD, worker mock (success + failure)
  - Surfaced by: §11.2 D-r8 + R3 regression
  - Files: `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-data-access` passes
- [ ] **T19 (P1, human: ~2h / CC: ~15min)** — `ui-state-data-access` test — EXTEND `ui-state.store.spec.ts` (~12 cases): per-path file view shape, fileTabsByWorkspace CRUD, lastActiveTabId CRUD (**R5 contributing**), drafts CRUD, pruneWorkspace extensions, split-keys hydrate (one key missing → defaults), bumped keys persist across reload
  - Surfaced by: §11.2 D-r8 + R5 regression
  - Files: `libs/desktop-ui-state-data-access/src/lib/ui-state.store.spec.ts` (EXTEND)
  - Verify: `pnpm nx test desktop-ui-state-data-access` passes
- [ ] **T20 (P1, human: ~1h / CC: ~10min)** — `workspaces-data-access` test — NEW `workspace-mutations.facade.spec.ts` (~5 cases): fans out all four refreshes, tolerates fileViews.refresh rejection, no-op when workspaceId invalid
  - Surfaced by: §11.2 D-r8
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace-mutations.facade.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-data-access` passes
- [ ] **T21 (P1, human: ~2h / CC: ~15min)** — `workspaces-feature` test — NEW `workspace-tab-content.spec.ts` (~6 cases): intent='preview' from NavigationEnd state → previewFor; intent absent → pinFor (default); intent='pin' from NavigationEnd state → pinFor; chat kind → setActiveChat + setActiveFor(null); lastActive write on every transition; back-navigation that restores prior history.state — assert behavior matches the captured-on-transition policy
  - Surfaced by: §11.2 D-r8 + D-r2
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-tab-content.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-feature` passes
- [ ] **T22 (P1, human: ~3h / CC: ~25min)** — `workspaces-feature` test — NEW `feature-file-content.spec.ts` (~10 cases): auto-pin on dirty edge (false→true → pinFor; Cmd-Z back to baseline → stays pinned; re-type → no spurious pinFor; new file → guard resets); **(R4)** draft hydrate on filePath change; draft write on editorValue change; **(R2)** save success → mutations.softRefreshAfterMutation; saveError 'stale' / 'frozen' → no refresh; clearDraft on save success
  - Surfaced by: §11.2 D-r8 + R2 + R4 regressions
  - Files: `libs/desktop-workspaces-feature/src/lib/feature-file-content.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-feature` passes
- [ ] **T23 (P1, human: ~1h / CC: ~10min)** — `workspaces-data-access` test — NEW `workspace-tab-resolver.service.spec.ts` (~6 cases): defaultTabId returns persisted last-active (file kind valid → returns); (chat kind valid → returns); (file kind stale path → trust URL, returns); (last-active is null → falls back to chat default); (parse fails → falls back); **(R6)** workspace re-navigation restores last active
  - Surfaced by: §11.2 D-r7, D-r8 + R6 regression
  - Files: `libs/desktop-workspaces-data-access/src/lib/workspace-tab-resolver.service.spec.ts` (NEW)
  - Verify: `pnpm nx test desktop-workspaces-data-access` passes
- [ ] **T24 (P2, human: ~30min / CC: ~5min)** — `repositories-ui` test — EXTEND `ui-file-tree-row.spec.ts` (or NEW if missing) (~3 cases): native dblclick on file row emits `fileDoubleClick`; dblclick on folder row does NOT emit; single-click still emits `fileClick`
  - Surfaced by: §11.2 D-r8
  - Files: `libs/desktop-repositories-ui/src/lib/ui-file-tree-row.spec.ts`
  - Verify: `pnpm nx test desktop-repositories-ui` passes
- [ ] **T25 (P3, human: ~30min / CC: ~5min)** — `TODOS.md` — append 3 new TODOs: drafts compression for very large files; `WorkspaceMutationsFacade` horizon (migrate other post-mutation choreography); multi-window draft contention
  - Surfaced by: §11.5
  - Files: `TODOS.md`
  - Verify: TODO entries present + linked to §11.5

### 11.9 Sequencing (updated)

1. **Lane A (T1–T4 + T17)** — close button + italic + dead cap + FileTab type. Smallest, highest user-visible value. 1 PR.
2. **Lane B (T5–T8 + T18–T20)** — data layer + drafts service + mutations facade. Independent of A. 1 PR.
3. **Lane D (T16)** — drafts worker. Can land inside Lane B's PR or as a follow-up; T18 mocks the worker either way.
4. **Lane C (T9–T15 + T21–T23 + T24)** — feature integration. Depends on Lane B (consumes new selectors + facade + service helpers). 1 PR.
5. **T25** — TODOS.md update — fold into Lane A or land standalone.

3 PRs total (A, B+D, C), executable in series.

### 11.10 Completion summary

- Step 0: Scope Challenge — scope **expanded** (lift cap + drafts + last-active-tab + reshape per-path mode + worker write); user accepted full lake per D-r1, D-r3, D-r7, D-r10.
- Architecture Review: 4 issues raised, all decided (D-r1, D-r2, D-r3, D-r4); A5 v1→v2 reset concern resolved via D-r9 split keys (and user clarification: pre-prod, no migration burden).
- Code Quality Review: 2 issues raised, both decided (D-r5 DRY helper, D-r6 auto-pin idempotency).
- Test Review: coverage diagram produced; 52 + 5 last-active-tab gaps mapped; 6 mandatory regressions (R1–R6); full coverage chosen per D-r8.
- Performance Review: 1 issue raised, decided (D-r10 drafts worker).
- NOT in scope: 10 items listed in §11.4.
- What already exists: 9 items listed in §11.3.
- TODOS.md updates: 3 new items proposed + approved (§11.5).
- Failure modes: 0 critical gaps flagged (table in §11.6); worker-write silent failure is the closest watch item.
- Outside voice: not run on this rerun (P1.3 already had a codex pass in §9.3; no new codex run requested).
- Parallelization: 4 lanes; 3 PRs in sequence.
- Lake Score: 10/10 recommendations chose the complete option (drafts + reshape + facade + DRY helper + auto-pin guard + last-active + full coverage + worker write + split keys + 25 tasks).

---

## GSTACK REVIEW REPORTS

One row per reviewed slice. All reviewed slices are now shipped (✅).

### P1.1 — PR workflow rewire ✅ DONE

| Review     | Runs           | Status       | Findings                                                                                                                            |
| ---------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Eng Review | 1 (2026-05-24) | CLEAR (PLAN) | 7 decisions resolved (D1–D6, D9); 22 test gaps closed (D6); 2 regressions (R1, R2); 2 follow-ups → TODOS.md (D8, D10); 0 critical gaps |

- **CODEX / CROSS-MODEL:** N/A — user declined outside voice (D7).
- **VERDICT:** ENG CLEARED — implemented against §7.6 task list.

### P2.1 — File tree real loading state ✅ DONE

| Review     | Runs | Status       | Findings                                              |
| ---------- | ---- | ------------ | ----------------------------------------------------- |
| Eng Review | 1    | CLEAR (PLAN) | 3 findings resolved, 0 critical gaps, 4 tasks emitted |

- **VERDICT:** ENG CLEARED — 2 source + 2 spec files. Cache-hit short-circuit regression test mandatory.

### P1.2 + P1.3 — Changes persistence + file tabs (P1.2 ✅ DONE, P1.3 pending)

| Review       | Runs | Status       | Findings                                                                                                                                                                            |
| ------------ | ---- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex Review | 1    | ISSUES_FOUND | 2 cross-model tensions resolved (intent encoding, auto-pin race); 6 codex items → TODOs                                                                                              |
| Eng Review   | 1    | CLEAR (PLAN) | 12 issues across §1–§4 (5 architecture, 2 code-quality, 5 test gaps, 2 perf); 1 critical gap captured (localStorage quota — TODO); 53 test gaps mapped, 3 mandatory regression tests |

- **CODEX:** Applied to plan (§7.10): URL-query-param → router state extras with `replaceUrl: true`; raw-valueChange auto-pin → `dirty()`-flip-based effect.
- **VERDICT:** ENG CLEARED per §7 adjustments. P1.3a (close button) + P1.2 in parallel; P1.3b after P1.3a.

### P1.3 re-run — file tabs (full P1.3a + P1.3b spec)

Second pass on P1.3 after P1.2 shipped — supersedes the P1.3-portion of the row above. See §11.

| Review     | Runs           | Status       | Findings                                                                                                                                                                                                                       |
| ---------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eng Review | 1 (2026-05-24) | CLEAR (PLAN) | 10 decisions resolved (D-r1–D-r10); 6 mandatory regressions (R1 close ×, R2 save→softRefresh, R3 no FIFO eviction, R4 draft persistence, R5 per-path mode, R6 last-active tab restore); 0 critical gaps; 25 tasks (T1–T25) emitted |

- **CODEX / CROSS-MODEL:** Not run on this re-run; the prior codex pass (§7.10) still applies (intent encoding via router state, auto-pin via dirty edge).
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED per §11 adjustments. Sequencing per §11.9: Lane A → Lane B (+D) → Lane C, 3 PRs.

### P2.4 + P2.5 — Hunk labels + expand button ✅ DONE

| Review     | Runs | Status       | Findings                  |
| ---------- | ---- | ------------ | ------------------------- |
| Eng Review | 1    | CLEAR (PLAN) | 3 issues, 0 critical gaps |

- **VERDICT:** ENG CLEARED — single PR slice (one file: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts` + new spec).

### P2.2 — Composer visibility on file tabs ✅ DONE

| Review     | Runs | Status       | Findings                                            |
| ---------- | ---- | ------------ | --------------------------------------------------- |
| Eng Review | 1    | CLEAR (PLAN) | 4 issues, 0 critical gaps; §2.6 rewritten per D1–D5 |

- **TODOS:** 2 added (per-chat draft persistence; "talking to chat X" indicator) — blocked on multi-chat workspaces.
- **TASKS:** 6 (T1–T6) emitted; 4 × P1, 1 × P2, 1 × P3.
- **VERDICT:** ENG CLEARED — implemented after P1.3 prep.
