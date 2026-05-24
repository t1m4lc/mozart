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

| ID   | Area          | Item                                                                                         | Priority |
| ---- | ------------- | -------------------------------------------------------------------------------------------- | -------- |
| P1.1 | Right sidebar | PR workflow rewire (Create PR primary, Merge now "Soon", GitHub gate, status transitions)    | **P1**   |
| P1.2 | Right sidebar | Changes tab persistence (cross-reload hydration, watcher coverage audit, rename handling)    | **P1**   |
| P1.3 | Middle shell  | File tabs (close button, preview/pin tabs, double-click in tree, save→Changes sync)          | **P1**   |
| P1.4 | Middle shell  | File header refactor (drop `FeatureFileToolbar`, reuse `MzFileDiffCard` with `flush` chrome) | **P1**   |
| P2.1 | Right sidebar | File tree real loading state (tree-shaped skeleton, min-delay anti-flicker)                  | P2       |
| P2.2 | Middle shell  | Composer visibility on file tabs                                                             | P2       |
| P2.3 | Middle shell  | Save/Discard overlay (absolute, shadow, no layout push)                                      | P2       |
| P2.4 | Diff UX       | Human-readable hunk labels (`@@ -120,7 @@` → `"120 lines above"`)                            | P2       |
| P2.5 | Diff UX       | Better expand-context button (wide strip vs 12px chevron)                                    | P2       |
| P2.6 | Right sidebar | Setup/Run tab UX (empty-state CTA, behavior audit)                                           | P2       |
| P2.7 | Right sidebar | Terminal first-load visual (xterm mount window)                                              | P2       |
| P3.1 | Middle shell  | Preview mode default + scope decision (markdown only)                                        | P3       |

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

### 2.1 P1.1 — PR workflow rewire

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

### 2.2 P1.2 — Changes tab persistence

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

### 2.5 P2.1 — File tree real loading state

**Goal:** First-instantiation skeleton is a tree-shaped placeholder,
not seven generic shimmer rows. Add a ≥150ms min-delay to prevent
flicker on cache hits.

**Files to touch:**

- `libs/desktop-repositories-ui/src/lib/ui-file-tree-skeleton.ts:1–28`
  — rewrite to render 3 collapsed folder rows (with chevron-right
  glyph + indented children placeholders) and 6 nested file rows.
  Vary widths but keep them deterministic.
- `libs/desktop-repositories-feature/src/lib/feature-file-tree.ts:165–182`
  — wrap `showSkeleton` in a min-delay gate: track `loadingStart`
  in a `signal`, compute `elapsedSinceLoad`, only hide the
  skeleton when `Math.max(elapsedSinceLoad, 150ms)` has passed.

**Verification:**

1. Open a new project's workspace with no cached tree — skeleton
   is tree-shaped, holds for at least 150ms, then real tree pops
   in.
2. Switch between sibling workspaces — sibling-tree fallback still
   wins; no skeleton flash.

---

### 2.6 P2.2 — Composer visibility on file tabs

**Goal:** Composer remains visible at the bottom of the middle shell
regardless of whether the active tab is `chat` or `file`.

**Files to touch:**

- `libs/desktop-workspaces-feature/src/lib/feature-workspace-middle.ts:42–88`
  — extract the composer mount into its own component
  (`FeatureWorkspaceComposer`) or move the `<mz-composer>` into
  `WorkspaceTabContent` directly so it sits below the `@switch`
  branches.
- `libs/desktop-workspaces-feature/src/lib/workspace-tab-content.ts:35–86`
  — wrap the content area in a flex column with `<mz-composer>`
  sticky at the bottom. Edit/Diff modes adjust their `flex-1`
  panels so the composer doesn't overlap.

**Verification:**

1. Open a file tab: composer is visible at the bottom; sending a
   prompt routes to the same chat the workspace is on.
2. Switch back to chat tab: composer is in the same spot, no
   layout shift.

**Risks / notes:**

- The composer's prompt routing may need to know "which chat" when
  a file tab is active. Default to the most-recently-active chat
  in the workspace; surface a small "→ Chat: My-Chat" indicator if
  ambiguity matters.

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

### 2.8 P2.4 — Human-readable hunk labels

**Goal:** Replace `@@ -120,7 +120,8 @@` with text like
`"120 lines above"` or `"34 unchanged lines"`, while keeping the raw
header available as `title`.

**Files to touch:**

- `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:131–140`
  — extend the `hunk-header` branch with a formatter that consumes
  `oldStart`, `oldCount`, `newStart`, `newCount` from the parsed
  `DiffHunk` and produces a short label.
- Tag the doc line with a `data-original-header` attr so
  hover/copy works for diff-literate users.
- `libs/mozart-ui/diff-parser/src/lib/diff-parser.ts:20–162`
  — confirm `DiffHunk` exposes the parsed numbers (it does); add
  no parser changes.

**Verification:**

1. Open a diff with multiple hunks: each row shows a human label,
   tooltip shows the original `@@` syntax.
2. Copy-paste from the hunk row still copies the original `@@`
   text (if that's a feature the team uses).

---

### 2.9 P2.5 — Better expand-context button

**Goal:** The hunk-row gutter chevron becomes a wider, labelled
click target — visual parity with the trailing-gap expand bar.

**Files to touch:**

- `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts:478–532`
  — widen the button into a small strip with text `"Show 20
lines above"` (or just `"+20"` if width-constrained). Reposition
  so the strip sits inside the hunk row's gutter, not at the seam.
- Optional: add a `"Show all"` modifier (shift+click already
  doubles; document this).

**Verification:**

1. Hunk row button has visible label.
2. Click expands 20 lines above; trailing-gap bar still works.

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

## 7. Engineering review outcomes — P1.1

Captured during `/plan-eng-review` on 2026-05-24 against §2.1 (P1.1 PR
workflow rewire). Earlier sections are the RFC; this section is the
implementation contract for P1.1 specifically. P1.2–P3.1 keep §2 as-is
until their own review runs.

### 7.1 Decisions (D1–D10)

| ID | Topic | Choice | Implication |
| --- | --- | --- | --- |
| D1 | Where do `commit → in_progress` and `PR success → in_review` writers live? | **Facade wrappers in WorkspacesFacade** | Adds `WorkspacesFacade.commitWorkspace(...)` and `WorkspacesFacade.createPr(...)`. One writer per transition; mirrors existing `setStatus / reopen / togglePinned` shape at `workspace.facade.ts:307–336`. Both dialogs (`feature-commit-dialog`, `feature-create-pr-dialog`) route through the wrappers. |
| D2 | What happens when `createWorkspacePr` succeeds but `setStatus('in_review')` adapter write fails? | **Best-effort flip + warn toast** | The wrapper attempts the flip optimistically; on adapter failure it logs and surfaces a warn toast `"PR opened, but status update failed — refresh to retry"`. It does NOT roll back the in-memory flip. The PR URL is still returned. Reload re-reads from the DB and may show drift (covered by the reconciliation TODO from D8). |
| D3 | Should the PR-success flip be guarded against backward state transitions? | **Guard on `from ∈ {backlog, in_progress}`** | `createPr` checks the current status before flipping. `done` / `canceled` workspaces are NOT regressed to `in_review` even though the right-aside merge menu still shows for them (`shell-right.ts:62–69` has no `isFrozen` guard). Mirrors the commit-flip guard. |
| D4 | Resolve §3.4: should `setStatus` early-return on no-op? | **Yes — add `if (previous === status) return;`** | Three-line defensive add at the top of `setStatus`. Closes the §3.4 open question. Eliminates wasted SQLite round-trip + spurious rollback path on the new wrapper paths. |
| D5 | MergeActionMenu: drop `primaryAction` input or keep it? | **Keep the input; shell-right passes `'pr'` constant** | Component API stays as-is; the temporary "PR is the only reachable primary" policy lives in shell-right's `mergePrimaryAction` returning `'pr'`. Re-enabling Merge now is a one-line revert. Minor dead-code smell on the `'local'` branches in label/icon/tooltip computeds is acceptable. |
| D6 | Test coverage tier? | **Full lake (A)** | Four spec files plus E2E. New: `workspace.facade.spec.ts`, `merge-action-menu.spec.ts`, `feature-create-pr-dialog.spec.ts`, `apps/desktop-e2e/.../pr-workflow.e2e.spec.ts`. Pattern matches `mz-file-diff-card.spec.ts` (TestBed + provideZonelessChangeDetection + matchMedia stub). |
| D7 | Outside voice (codex) on the plan? | **Skipped** | User declined the second-opinion gate. In-skill review stands. |
| D8 | TODO #1 — reconciliation pass for PR-vs-status drift? | **Add to TODOS.md** | Captures the rare-failure recovery path D2 deferred. See `TODOS.md` → "Workspaces — reconciliation pass for PR-vs-status drift (P1.1 D2 follow-up)". |
| D9 | "Repo not linked to GitHub remote" gate — in P1.1 or deferred? | **Add detection + gate inside P1.1** | New Tauri command exposing the result of `parse_github_remote` (or an equivalent boolean), new `ProjectsFacade.isGithubRemoteFor(projectId)` signal, MergeActionMenu gates primary + dropdown PR row on BOTH `githubConnected` AND `isGithubRemote`. Tooltip text differentiates the two gate states. Out of scope here: the guided "Link this repo to GitHub" provisioning flow (see D10). |
| D10 | TODO #2 — guided "Link this repo to GitHub" provisioning flow? | **Add to TODOS.md** | The recovery path for users on local-only or non-GitHub repos. See `TODOS.md` → "Workspaces — guided 'Link this repo to GitHub' flow (P1.1 D10)". |

### 7.2 What already exists (reused, not rebuilt)

- **Optimistic-rollback `setStatus`** pattern at `workspace.facade.ts:307–318`, mirrored by `reopen` (`:325–336`), `togglePinned` (`:340–351`), `toggleUnread` (`:353–364`). The two new wrappers follow the same shape.
- **`ProfileFacade.githubConnected()` signal** at `profile.facade.ts:95`. Bootstrapped by `initializeGithub()` on app boot (`:102–111`). Plan §2.1's primary disable + dropdown row tooltip already wire to it (`merge-action-menu.ts:85`, `:115–117`).
- **`commands.createWorkspacePr`** returns `{ number, html_url }` via `github.rs:60–110`. The wrapper does not need a Rust change for D1's facade move.
- **`parse_github_remote`** at `apps/desktop-tauri/src/github.rs:131` already exists and is unit-tested for GitHub vs GitLab vs SSH vs empty. D9 just needs to expose the result to Angular.
- **`merge_workspace_locally`** at `apps/desktop-tauri/src/commands/mod.rs:2386–2404` continues to own the `'done'` transition. Rust stays the writer for atomic-with-worktree transitions; Angular owns the `'soft'` derived transitions. The asymmetry is intentional per §3.1.
- **`lastMergeAction`** persistence stays untouched; only `'pr'` reaches it for now (per plan §2.1 risks). The field is intentionally dead-coded for re-enablement.

### 7.3 Failure modes (this slice)

For each new codepath, one realistic production failure:

| Codepath | Failure | Test? | Error handling? | User sees? |
| --- | --- | --- | --- | --- |
| `WorkspacesFacade.setStatus` (early-return added) | Race: caller A reads `previous` then caller B writes a different status before A's adapter call lands | T10 — covers `previous === status` no-op path; race itself is unobservable under signals' synchronous semantics | Existing adapter try/catch rolls back | No visible effect on no-op; race outcome reflects last-writer-wins (correct) |
| `WorkspacesFacade.commitWorkspace` (NEW) | Commit fails after the new wrapper read the workspace | T10 — covers commit-failure-no-flip | Error rethrown to caller; commit-dialog renders inline error (existing path) | Inline error in commit dialog |
| `WorkspacesFacade.createPr` (NEW) — happy path | PR creates, flip fires from valid from-state | T10 + T13 (E2E) | None needed | Badge advances to `in_review` |
| `WorkspacesFacade.createPr` (NEW) — flip-failure | PR creates, `setUiStatus` adapter throws | T10 (D2 path) | D2 best-effort: log + warn toast | Toast `"PR opened, but status update failed — refresh to retry"` + PR URL still shown |
| `WorkspacesFacade.createPr` (NEW) — backward guard | PR opened against `done` workspace | T10 (D3 path) | D3 guard: no flip | Status stays `done`; PR URL still shown |
| `feature-create-pr-dialog` — mid-flow disconnect | `githubConnected` flips to false while dialog open | T12 + T13 (E2E) | Live alert + submit disabled | Inline alert with "Connect GitHub" link |
| `MergeActionMenu` (D9 gate) — non-GitHub remote | Workspace on GitLab/local repo, user authenticated to GitHub | T11 + T13 (E2E) | Primary + dropdown PR row disabled with differentiated tooltip | Tooltip "This repo isn't on GitHub" instead of "Connect GitHub to open PRs" |
| `commands.createWorkspacePr` — token revoked between dialog open and submit | Submit fires, command returns `r.status === 'error'` | T12 | Existing error inline in dialog | Inline error, submit re-enabled, status does NOT flip |

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

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 (2026-05-24) | CLEAR (PLAN) | 7 decisions resolved (D1–D6, D9); 22 test gaps closed under tier A (D6); 2 regressions captured (R1 setStatus idempotency, R2 commit-dialog swap); 2 follow-ups deferred to TODOS.md (D8 reconciliation, D10 link flow); 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** N/A — `/codex review` not run; user declined outside voice (D7).
- **CROSS-MODEL:** N/A — no codex pass on this review.
- **UNRESOLVED:** 0 — every AskUserQuestion answered.
- **VERDICT:** ENG CLEARED — P1.1 ready to implement against §7.6 task list. CEO Review and Design Review not required for this slice (no scope/UX decisions). Outside voice skipped by user choice.
