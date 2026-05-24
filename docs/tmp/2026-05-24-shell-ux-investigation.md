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

| Input          | Output                  |
| -------------- | ----------------------- |
| `n > 1`        | `"${n} lines above"`    |
| `n === 1`      | `"1 line above"`        |
| `n === 0`      | `"No more lines above"` (defensive; caller usually hides the row) |

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
2. Copy-paste from the hunk row still copies the original `@@`
   text (if that's a feature the team uses).
   > **Decisions from /plan-eng-review 2026-05-24:** Replace the doc-line text directly (label IS the text). Tooltip shows the raw `@@` via `title` on a line decoration. **Hide the hunk row entirely when both gaps adjacent to the hunk are fully revealed** — a fully-expanded hunk no longer needs a separator row. Label describes the gap above ("N lines above"), coupling to the P2.5 button's action. Function-scope suffix preservation deferred to TODOS.md.
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
| Input          | Output                  |
| -------------- | ----------------------- |
| `n > 1`        | `"${n} lines above"`    |
| `n === 1`      | `"1 line above"`        |
| `n === 0`      | `"No more lines above"` (defensive; caller usually hides the row) |

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

1. Open a multi-hunk diff: each visible hunk row shows `"N lines above"`; hover tooltip shows the original `@@ -a,b +c,d @@`.
2. Fully expand a middle hunk's gap-above AND gap-below — that hunk's header row disappears from the doc; adjacent lines flow together.
3. First hunk starts at line 1 (no gap above): hunk row is hidden from first render.
4. Copying a hunk row puts the human label on the clipboard. The original `@@` only appears on hover (intentional — drops the prior "copy returns original" verification step which contradicted the goal).

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

### 2.9 P2.5 — Better expand-context button

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

1. Hunk row button has visible label.
2. Click expands 20 lines above; trailing-gap bar still works.
   > **Decisions from /plan-eng-review 2026-05-24:** Keep the button in the gutter (it stays a `GutterMarker`, not a block widget) — preserves the §2.8 doc-line architecture. Widen the hit target ~2× (12×12 circle → ~24×16 strip with chevron + `+20` count badge). The doc-line label from P2.4 lives in parallel: button = action, row text = static info.
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

## 7. Eng review adjustments — 2026-05-24

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

## 7. /plan-eng-review notes — P2.4 + P2.5 (2026-05-24)

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

| Codepath                                  | Failure scenario                                                                                            | Has test?              | Has handling?  | Silent?                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- | ----------------------------- |
| `buildDocPlan` hide-on-both-empty         | Lookahead computes wrong `linesBelow`; row hides when it shouldn't, or stays when it should hide.           | yes (§2.8.1 cases 5–7) | n/a (pure)     | no — visible UX               |
| `buildDocPlan` hide-on-both-empty         | Gutter alignment breaks because lineMeta length stays in sync with doc but downstream consumer assumed N+1. | partial (case 8)       | n/a            | no — visible misalignment     |
| `buildLineDecorations` title decoration   | Title attr fails to render via `Decoration.line({ attributes: { title } })`.                                | yes (case 9)           | n/a            | yes — fall back: no tooltip   |
| `HunkButtonMarker.toDOM` wider hit target | Wider button overflows the gutter on the left, clipped by parent.                                           | no (visual)            | css; manual QA | no — visible overflow         |
| `HunkButtonMarker.toDOM` count badge      | Badge text not in sync with `linesAvailable` after rapid clicks.                                            | n/a (eq covers)        | `eq` rebuild   | no — would show wrong number  |
| `HunkButtonMarker.toDOM` shift-click      | Wider DOM intercepts shiftKey wrong; only single step expands.                                              | yes (case 16)          | n/a            | yes — silent regression to 1× |
| Codepath                                       | Failure scenario                                                                                            | Has test? | Has handling?    | Silent?                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- | ---------------- | -------------------------------- |
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

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —            | not run                                                                                                                                                                                                                                                                                                              |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 1    | ISSUES_FOUND | 2 cross-model tensions resolved (intent encoding, auto-pin race); 6 codex items captured as TODOs                                                                                                                                                                                                                    |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR (PLAN) | 12 issues found across §1–§4 (5 architecture, 2 code-quality, 5 test gaps batched into one decision, 2 perf); 0 unresolved; 1 critical gap captured (localStorage quota — TODO); 53 test gaps mapped, 3 mandatory regression tests; outside voice ran (codex), 2 cross-model tensions surfaced + applied to the plan |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —            | not run (preview/pin is a behavioral spec, not a visual one; reconsider for P1.4 file-header refactor)                                                                                                                                                                                                               |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —            | not run (no developer-facing API surface in this scope)                                                                                                                                                                                                                                                              |

**CODEX:** Surfaced 2 substantive issues that the eng review missed and 6 smaller risks. Both substantive items were applied to the plan (§7.10): URL-query-param → router state extras with `replaceUrl: true`; raw-valueChange auto-pin → `dirty()`-flip-based effect. The 6 smaller items live in §7.4 TODOs.

**CROSS-MODEL:** Two tensions — both resolved in codex's favor with the user's confirmation. No remaining disagreement.

**UNRESOLVED:** 0.

**VERDICT:** ENG CLEARED — P1.2 + P1.3 ready to implement per §7 adjustments. Suggested lanes: P1.3a (close button) + P1.2 (persist + rename) in parallel; P1.3b (preview/pin + tab persistence + save sync) after P1.3a lands.
| Review | Trigger | Why | Runs | Status | Findings |
| ------------- | -------------------- | -------------------------------- | ---- | -------------- | ------------------------------ |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 3 issues, 0 critical gaps |
| Design Review | `/plan-design-review`| UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — P2.4 + P2.5 ready to implement as a single PR slice (one file: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts` + new `cm-diff-extensions.spec.ts`).
| Review        | Trigger              | Why                              | Runs | Status         | Findings                       |
| ------------- | -------------------- | -------------------------------- | ---- | -------------- | ------------------------------ |
| CEO Review    | `/plan-ceo-review`   | Scope & strategy                 | 0    | —              | —                              |
| Codex Review  | `/codex review`      | Independent 2nd opinion          | 0    | —              | —                              |
| Eng Review    | `/plan-eng-review`   | Architecture & tests (required)  | 1    | CLEAR (PLAN)   | 3 issues, 0 critical gaps      |
| Design Review | `/plan-design-review`| UI/UX gaps                       | 0    | —              | —                              |
| DX Review     | `/plan-devex-review` | Developer experience gaps        | 0    | —              | —                              |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — P2.4 + P2.5 ready to implement as a single PR slice (one file: `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts` + new `cm-diff-extensions.spec.ts`).

