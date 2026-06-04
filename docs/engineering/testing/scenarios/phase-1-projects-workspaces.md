# Phase 1 — Projects + Workspaces

Scenarios covering the dashboard 3-card landing, project addition (3
flows), workspace auto-creation, sidebar projects group, and the
workspace context menu / hover popover.

---

### Scenario : User opens an existing folder as a project

**Priority** : MUST

**Preconditions** :
- User is authenticated, onboarding complete.
- Currently on `/` (dashboard).
- A local folder `~/code/my-existing-repo` exists and is a git
  repository.

**Steps** :
1. Click the "Open project" card.
2. The OS folder picker opens.
3. Pick `~/code/my-existing-repo`.

**Expected** :
- Dialog closes.
- Sidebar shows `my-existing-repo` as a new expanded project.
- Beneath it, a single workspace appears with an artist-themed name
  (e.g. `bowie-1`) and a branch derived from the workspace name.
- App routes to `/workspaces/<new-workspace-id>`.
- Composer is focused.
- Workspace status starts as `idle`.

**Edge cases** :
- Folder is NOT a git repository → "Initialize project" dialog appears
  before the project is registered.
- Folder is already a registered Mozart project → no duplicate created
  ; user is navigated to the existing project's first workspace.
- User cancels the OS picker → return to dashboard, no state change.

---

### Scenario : User clones a GitHub repo from the dashboard

**Priority** : MUST

**Preconditions** :
- Authenticated, onboarding complete, on `/`.
- Network reachable for `git clone` (HTTPS).

**Steps** :
1. Click the "Open GitHub project" card.
2. The "Clone GitHub repo" dialog opens.
3. Paste `https://github.com/octocat/Hello-World.git` into the URL
   field.
4. Leave the default location (`~/Mozart/repos` or equivalent).
5. Press Enter (or click `Clone repo`).

**Expected** :
- Submit button shows a spinner while `git clone` runs.
- On success, dialog closes ; folder
  `~/Mozart/repos/Hello-World/` exists with `.git/`.
- Sidebar shows `Hello-World` as a project with one workspace.
- App routes to that workspace.

**Edge cases** :
- URL invalid (missing scheme, not a GitHub URL) → inline error red
  text + Submit disabled.
  > TODO clarify (IMP-010 — regex enforcement ships then).
- Destination already exists → dialog surfaces an inline error and
  refuses to submit.
- Network failure → spinner stops, inline error appears, dialog stays
  open.

---

### Scenario : User triggers Quick start to create a fresh project

**Priority** : SHOULD

**Preconditions** :
- Authenticated, on `/`.

**Steps** :
1. Click the "Quick start" card.
2. Dialog "Create a project" opens.
3. Type `my-test` in Project name.
4. Leave parent folder default.
5. Leave `Empty` template selected.
6. Press Enter (or click `Create`).

**Expected** :
- Folder `<parent>/my-test` exists with `README.md` + `.gitignore` +
  initial commit on `main`.
- Sidebar lists `my-test` project + one workspace.
- App routes to that workspace.

**Edge cases** :
- Project name has spaces or invalid characters → sanitized to
  kebab-case (`My Test` → `my-test`).
- Folder already exists → inline error + abort.
- `gstack` template radio is disabled with a "Soon" indicator.
- IMP-006 ships : Quick start card is gated behind a "Coming soon"
  badge → no dialog opens on click.

---

### Scenario : Non-git folder triggers Initialize project dialog

**Priority** : MUST

**Preconditions** :
- Authenticated, on `/`.
- A folder `~/Documents/plain-folder` exists, NO `.git`.

**Steps** :
1. Click "Open project".
2. Pick `~/Documents/plain-folder`.
3. The "Initialize project" dialog appears.
4. Click `Initialize the project`.

**Expected** :
- `git init` + initial commit run in the folder.
- The folder is registered as a project.
- A workspace is auto-created and routed to.

**Edge cases** :
- User clicks Cancel → dialog closes, folder is NOT registered, no git
  init runs.
- Init fails (permissions) → inline error + dialog stays open.

---

### Scenario : Sidebar lists projects, expand / collapse per project

**Priority** : MUST

**Preconditions** :
- Authenticated, dashboard or workspace.
- At least 2 projects, each with at least 1 workspace.

**Steps** :
1. Click the Projects group's chevron / project name to toggle expand.

**Expected** :
- Project rows show a folder icon + name.
- Expanded project reveals workspace rows beneath, indented with a
  left border.
- Collapsing hides the workspace rows ; the expanded state persists
  across re-renders of the same session.
- Drag-reorder by dragging a project row to a new position ; new order
  persists across app restart.

**Edge cases** :
- Empty projects list → "No projects yet" empty state with a
  right-click menu showing Open / Clone / Quick start.
- Project with zero workspaces → "No workspaces yet" empty state with
  right-click menu offering "New workspace".

---

### Scenario : Workspace row right-click reveals context menu

**Priority** : MUST

**Preconditions** :
- Authenticated, sidebar visible, a workspace exists.

**Steps** :
1. Right-click on a workspace row.

**Expected** :
- Context menu shows : Pin / Unpin, Set status → submenu, Rename,
  Mark as unread (or Mark as read, after IMP-020), Archive.
- Clicking Pin floats the workspace to the top of its project list ;
  persists across restart.
- Clicking Set status → status submenu allows manual override (idle /
  running / changed / failed).
- Clicking Rename turns the row into an editable input ; Enter commits,
  Esc cancels, blur commits.
- Clicking Mark as unread (or read) toggles the bold styling on the
  row.
- Clicking Archive hides the workspace ; data preserved server-side.

**Edge cases** :
- Rename to empty string or whitespace → row reverts without an
  update.
- Archive on the currently-routed workspace → router falls back to
  `/` or the next sibling.

---

### Scenario : Workspace hover popover shows recent activity

**Priority** : SHOULD

**Preconditions** :
- Sidebar visible, a workspace exists with at least one chat that
  received a message in the last week.

**Steps** :
1. Hover over the workspace row for ~500 ms (no click).

**Expected** :
- Popover card appears (right side of the row).
- Card shows : workspace name, status pill (idle / running / changed /
  failed), active chat title, last assistant response (truncated),
  relative date (`2 min ago` etc.).

**Edge cases** :
- Workspace has no chat yet → fields render as empty strings or "—".
- User moves cursor away before 500 ms → popover does not open.
- Reduced-motion → popover appears instantly, no fade.

---

### Scenario : State coherence — composer hidden on dashboard

**Priority** : MUST

**Preconditions** :
- Authenticated, on `/`.

**Steps** :
1. Observe the central column.

**Expected** :
- Breadcrumb header, workspace tab bar, composer, right aside all
  hidden.
- Only the 3 dashboard cards + Mozart logo are visible.
- Left sidebar (Projects + Help/Settings footer) is visible.

**Edge cases** :
- Navigate to a workspace → all four elements appear.
- Navigate back to `/` via clicking the Mozart logo → all four
  disappear again.

---

### Scenario : Filter popover preserves the full project list

**Priority** : MUST (after IMP-001)

**Preconditions** :
- 3 projects exist : `alpha`, `beta`, `gamma`. All visible by default.

**Steps** :
1. Click the filter icon at the top of the Projects group.
2. In the "Show projects" multi-select, deselect `All` and pick
   `alpha`.
3. Close the popover.
4. Reopen the popover.

**Expected** :
- After step 2 : sidebar shows only `alpha`.
- After step 4 : the multi-select dropdown lists all three projects
  (`alpha`, `beta`, `gamma`) plus the `All` sentinel.

**Edge cases** :
- Pick `All` again → filter resets, sidebar shows all 3 projects.
- Deselect everything → falls back to `All` (no empty state allowed).

> Validates IMP-001 acceptance criteria.

---

### Scenario : Group by Status splits workspaces by status

**Priority** : SHOULD (after IMP-012)

**Preconditions** :
- 1 project with 4 workspaces : 2 `idle`, 1 `running`, 1 `failed`.

**Steps** :
1. Open the filter popover.
2. Change Group by → `Status`.

**Expected** :
- Sidebar regroups : a "Running" group at the top (1 workspace), a
  "Failed" group (1), an "Idle" group (2).
- Each group's chevron expand/collapse works independently.

**Edge cases** :
- One status has zero workspaces → the group section does not render.
- Switching back to "Project" returns to the original tree.

---

### Scenario : First launch — empty database renders dashboard + empty sidebar groups

**Priority** : MUST

**Preconditions** :
- Fresh install. DB empty (no projects, no chats).
- Authenticated, onboarding complete.

**Steps** :
1. Launch the desktop app.

**Expected** :
- Route is `/` (Dashboard).
- Central column shows 3 large cards in a single row : "Open project",
  "Open GitHub project", "Quick start".
- Left sidebar shows the Projects group with the empty state
  "No projects yet." and the Chats group with "No chats yet.".
- No right aside, no breadcrumb, no tab bar, no composer.
- Help icon (footer-left) is rendered but disabled.
- Settings gear (footer-left) routes to `/settings`.

**Edge cases** :
- Sidebar collapsed (header toggle) → a top-right toggle button
  appears on the Dashboard to bring it back. Same for the Welcome
  state.

---

### Scenario : Workspace row affordances — icon, unread bold, streaming dots

**Priority** : SHOULD

**Preconditions** :
- A project with one workspace. The workspace has an active chat.

**Steps** :
1. Observe the workspace row in the sidebar at rest.
2. Mark the chat unread (right-click → Mark as unread).
3. Send a message in the chat to start an assistant turn.
4. Wait for the turn to end.

**Expected** :
- Step 1 : row shows the workspace name (or its generated chat title
  if one exists) prefixed with `lucideGitBranch`.
- Step 2 : the row text becomes bold.
- Step 3 : while streaming, the branch icon is replaced by a centered
  animated-dots CLI loader.
- Step 4 : loader returns to the branch icon ; row may stay bold if
  still unread.

**Edge cases** :
- Chat without a generated title → row uses the workspace's musician
  name (`coltrane`, `bjork`, …).
- Multiple chats streaming in the same project → each row shows its
  own loader independently.

---

### Scenario : Branch picker — keyboard nav skips current target + workspace branch

**Priority** : SHOULD

**Preconditions** :
- A workspace open. The project has at least 3 local branches
  (e.g. `main`, `feature-a`, `feature-b`) plus the workspace's own
  branch.

**Steps** :
1. Click the branch-picker icon in the workspace toolbar.
2. Use arrow keys to navigate the Combobox.

**Expected** :
- Combobox opens with the current target branch (default `main`) as
  the first item, highlighted.
- The workspace's own branch is pinned last, disabled, labelled with
  `current` + a `Tab` keyboard-shortcut hint.
- Arrow keys skip both the current target and the workspace's own
  branch — only "other" branches are focusable.

**Edge cases** :
- Worktree has no other branches → list shows the empty state
  "No other branches available." (target + own branch still rendered).
- Pressing `Tab` while the picker is open jumps focus to the
  workspace's own branch row (read-only).

---

### Scenario : Restart safety — sidebar rehydrates and existing branch names grandfather

**Priority** : MUST

**Preconditions** :
- At least 2 projects with ≥1 workspace each. Some workspaces were
  created BEFORE the Phase 1 branch-prefix migration (DB rows with
  `agent/<slug>` branch names); some AFTER (workspace-name slug).

**Steps** :
1. Quit the app via OS window controls (or `pnpm dev` reboot).
2. Re-launch.

**Expected** :
- Sidebar Projects group repopulates with the previously added
  projects and their workspaces.
- Sidebar Chats group repopulates from the DB (same bucketing).
- Workspaces created before the migration KEEP their original branch
  names — no row is rewritten.
- Newly created workspaces (post-restart) still use the new branch
  policy.
- Pinned / archived / unread state persists.

**Edge cases** :
- SQLite file deleted while app was closed → next launch shows the
  empty-DB state (Scenario : First launch — empty database…).
- Workspace's worktree path no longer exists on disk → row still
  loads in the sidebar; opening it surfaces an inline error in the
  Files tab.
