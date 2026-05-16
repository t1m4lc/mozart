# Phase 4 — Git + Files + Terminal + IDE + PR

Scenarios covering the right aside (Files / Terminal / Run tabs),
the Open in IDE + Commit + Create PR action buttons (location TBD
after IMP-004 lands them in the central top bar), and the
just-in-time GitHub connect flow.

---

### Scenario : Right aside renders only when workspace is active

**Priority** : MUST

**Preconditions** :
- Authenticated.

**Steps** :
1. Navigate to `/`.
2. Navigate to a workspace.
3. Navigate back to `/`.

**Expected** :
- On `/` : right aside is collapsed (column width 0, handle hidden).
- On `/workspaces/:id` : right aside expands to its default width with
  the 3 tabs visible.
- On `/` again : right aside collapses.

**Edge cases** :
- Drag the right-aside resize handle → new width persists across
  navigations within the same session ; double-click on the handle
  resets to default.

---

### Scenario : Files tab shows changed files and renders diff

**Priority** : MUST

**Preconditions** :
- A workspace where the agent has modified at least one file
  (M = modified) and created one new file (A = added) on the branch.

**Steps** :
1. Click the Files tab.
2. Click a file with `A` badge.
3. Click a file with `M` badge.

**Expected** :
- Files panel lists changed files with relative paths and `A`/`M`/`D`
  badges.
- Step 2 : right pane shows the new file's content as a green-add
  diff.
- Step 3 : right pane shows the unified diff between the file in
  `base_branch` and the workspace branch.

**Edge cases** :
- No changes yet → empty state.
- `.gitignore`-excluded files do not appear.
- File deleted → strikethrough name + `D` badge ; diff shows the
  deletion.

---

### Scenario : Terminal tab opens a PTY in the workspace root

**Priority** : MUST

**Preconditions** :
- A workspace selected.

**Steps** :
1. Click the Terminal tab.
2. Type `pwd` (or `cd` on Windows) + Enter.

**Expected** :
- Terminal renders an xterm.js surface.
- The PTY's cwd is the workspace's root folder.
- Output streams live.

**Edge cases** :
- Switch to Files tab and back → terminal session persists (same
  scrollback).
- Resize the panel → terminal columns resize accordingly.
- Workspace switch → a different PTY is shown (one PTY per workspace).

---

### Scenario : Run tab executes the project's `run_command`

**Priority** : SHOULD

**Preconditions** :
- A project with `run_command = npm start` (or any script that
  outputs to stdout).
- A workspace under that project.

**Steps** :
1. Click the Run tab.
2. Click Run.

**Expected** :
- Status pill flips idle → running ; stdout streams below.
- On process exit 0 : status flips to `exited` with exit code 0.
- On process exit non-zero : status flips to `crashed` with the code.

**Edge cases** :
- No `run_command` configured → empty state with a CTA to configure.
- Stop button kills the child process and flips status to `stopped`.

---

### Scenario : Open in IDE launches the editor against the workspace

**Priority** : MUST

**Preconditions** :
- VS Code (or another supported IDE) is installed.
- A workspace selected.
- (Post IMP-004) Open-in-IDE dropdown lives in the central top bar.
- (Pre IMP-004) it lives in the right-aside header.

**Steps** :
1. Click the IDE dropdown chevron.
2. Pick VS Code.

**Expected** :
- The IDE process launches with the workspace's folder as the open
  project.
- The last-used IDE is remembered ; subsequent clicks on the
  primary part of the split-button re-launch the same IDE.

**Edge cases** :
- No IDE detected → the dropdown shows an empty list + a hint.
- Last-used IDE no longer installed → falls back to the first detected
  one.

---

### Scenario : Commit dialog stages selected files and writes the message

**Priority** : MUST

**Preconditions** :
- A workspace with at least 2 changed files.
- (Post IMP-004) Commit button is on the central top bar.
- (Pre IMP-004) Commit button is on the right-aside header.

**Steps** :
1. Click Commit.
2. The Commit dialog opens with each changed file listed and
   checked by default.
3. Uncheck one file.
4. Type "Initial scaffolding".
5. Click Commit.

**Expected** :
- A new commit lands on the workspace's branch with only the checked
  files staged.
- The commit message reads "Initial scaffolding" (no truncation).
- Files panel refreshes ; the unchecked file remains in the changed
  list, the checked ones disappear.

**Edge cases** :
- Empty message → submit disabled.
- All files unchecked → submit disabled.
- Commit fails (e.g. merge conflict during the operation) → inline
  error in the dialog ; dialog stays open.

---

### Scenario : Create PR dialog opens a Pull Request on GitHub

**Priority** : MUST

**Preconditions** :
- A workspace with a commit on a branch.
- GitHub already connected with push rights.

**Steps** :
1. Click Create PR.
2. Title prefills from the workspace name. Body is empty.
3. Type a body. Leave Draft unchecked.
4. Click Create.

**Expected** :
- The dialog calls the GitHub adapter ; on success, it surfaces the
  PR URL.
- The new PR exists on GitHub with the chosen title + body + base
  branch.

**Edge cases** :
- GitHub not connected yet → just-in-time prompt shows : "Connect
  GitHub to create a PR" with a Connect button that opens the OAuth
  flow.
- Push fails (auth, conflict) → inline error in the dialog.
- Draft checkbox checked → PR opens as a draft.

---

### Scenario : Just-in-time GitHub connect from Create PR

**Priority** : MUST

**Preconditions** :
- GitHub NOT connected. A workspace with a commit.

**Steps** :
1. Click Create PR.
2. The "Connect GitHub" CTA appears inside the dialog.
3. Click Connect.
4. Complete the OAuth flow in the browser tab.
5. Return to the desktop.

**Expected** :
- The Create PR dialog re-renders, now ready to submit.
- Subsequent PR creates flow as normal (no further OAuth).

**Edge cases** :
- User cancels OAuth → dialog stays in the disconnected state.
- (After IMP-008) The dialog also offers "Use a personal access
  token" as an alternative.

---

### Scenario : UI vocabulary is clean (no worktree / HEAD / refs/heads)

**Priority** : SHOULD

**Preconditions** :
- Build tooling executes a textual scan against the rendered DOM
  (or a static `grep` against HTML / TS templates).

**Expected** :
- No string in the visible UI contains : `worktree`, `worktree_path`,
  `branch_name`, `base_branch`, `HEAD`, `HEAD~1`, `detached`,
  `refs/heads`, `agent/wip-`.
- Branch names render as `bowie-1` etc., not as `agent/wip-bowie-1`.
- If any forbidden string surfaces (toolbar, badge, tooltip, error
  message) it is a regression — adapter mappers must strip these
  before they reach components.

**Edge cases** :
- Logs / dev-only diagnostics CAN contain these terms — the check
  excludes log strings.

---

### Scenario : Terminal moves to a dedicated bottom slot (after IMP-021)

**Priority** : COULD

**Preconditions** :
- A workspace.
- IMP-021 shipped.

**Steps** :
1. Open the right aside.

**Expected** :
- The aside is vertically split : Files / Changes / Runs / Diffs tabs
  on top, Terminal pinned to the bottom with its own resize handle.
- Dragging the handle resizes both panels.

**Edge cases** :
- Pre IMP-021 : Terminal is a horizontal tab alongside Files + Run.
  This scenario is gated by IMP-021 ; mark as COULD until then.

---

### Scenario : Aside header shows branch badge + Open in IDE + Commit (pre-IMP-004)

**Priority** : SHOULD

**Preconditions** :
- A workspace selected. IMP-004 has NOT yet moved Open-in-IDE / Commit
  to the central top bar.

**Steps** :
1. Observe the right-aside header chrome.
2. Hover the branch badge.
3. Open the IDE dropdown chevron.
4. Hover the Commit button.

**Expected** :
- A read-only branch badge sits left of the header showing the
  workspace's branch (e.g. `bowie-1`). Tooltip : "Branch for this
  workspace". Long names truncate.
- Open in IDE split button sits right of the header. Primary segment
  shows the last-used tool icon + workspace name (when there's room).
  The chevron opens a dropdown of detected tools ; selecting a tool
  flips the primary label.
- A Commit button (ghost variant, commit icon) sits at the far right,
  disabled with tooltip "Commit changes (coming soon)".
- The central workspace toolbar no longer hosts Open-in-IDE — it was
  moved to the aside header in Phase 4a.

**Edge cases** :
- After IMP-004 ships : Open-in-IDE + Commit + Create PR move to the
  central top bar ; the aside header only retains the branch badge.

---

### Scenario : Active right-aside tab is reflected in the URL

**Priority** : MUST

**Preconditions** :
- A workspace selected, Files tab active by default.

**Steps** :
1. Click the Run trigger.
2. Reload the app.
3. Click the Terminal trigger.
4. Click the Files trigger.
5. Reload again.
6. Switch to a different workspace via the sidebar.

**Expected** :
- Step 1 : URL becomes `#/workspaces/<id>?tab=run`.
- Step 2 : after reload, Run is still the active tab.
- Step 3 : URL becomes `?tab=terminal`.
- Step 4 : the `?tab` query param clears — no `?tab=files`.
- Step 5 : after reload, Files is active.
- Step 6 : the `?tab` param resets ; the new workspace lands on its
  default (Files) regardless of what was active before.

**Edge cases** :
- Browser back / forward navigates through the tab-state history.
- Directly visiting a `?tab=run` URL lands on Run on first paint.

---

### Scenario : Terminal and Run tabs render placeholder copy in v0.0.1

**Priority** : COULD

**Preconditions** :
- A workspace open. Phase 4d (Terminal) and Phase 4e (Run) have NOT
  shipped (current v0.0.1 state).

**Steps** :
1. Click the Terminal tab.
2. Click the Run tab.

**Expected** :
- Terminal tab content : muted-foreground text "Terminal coming soon."
- Run tab content : muted-foreground text "Run coming soon."
- The tab strip and URL persistence
  (Scenario : Active right-aside tab is reflected in the URL)
  continue to work with placeholder content.

**Edge cases** :
- After Phase 4d/4e land, this scenario becomes obsolete — see the
  full Terminal / Run scenarios above.

---

### Scenario : Files tab renders the worktree with relative paths and dirs-first sort

**Priority** : MUST

**Preconditions** :
- A workspace open with at least one folder and 3+ files.

**Steps** :
1. Open the Files tab (or confirm it's active by default).
2. Expand and collapse a folder via its chevron.
3. Hover a long-path row.

**Expected** :
- Tree is rooted at the project's worktree but ONLY relative paths
  are visible. No absolute path leaks anywhere in the UI.
- Folders render with `lucideFolder` / `lucideFolderOpen`. Files
  render with `lucideFile`. A chevron indicates collapse state.
- Sort order : directories first, then files. Case-insensitive
  alphabetical within each level.
- Empty repo (only `.git/`) → "No files yet." empty state.
- Long paths truncate with row ellipsis ; full filename appears via
  the row's `title` attribute on hover.

**Edge cases** :
- Filenames with non-ASCII characters sort consistently
  (Unicode-aware comparison).
- A symlinked directory renders once with its target name (no
  infinite recursion).

---

### Scenario : A/M/D status precedence — working-tree wins over committed

**Priority** : SHOULD

**Preconditions** :
- A workspace branch diverged from the project's default branch. A
  file `foo.ts` was ADDED in a commit on the workspace branch, then
  DELETED from the working tree.

**Steps** :
1. Open the Files tab.
2. Observe the badge on `foo.ts`.

**Expected** :
- Badge is `D` (destructive variant), not `A`.
- Hover label reads "Deleted".

**Edge cases** :
- A file modified in a commit then reset in the working tree
  (`git checkout HEAD~1 -- foo.ts`) shows no badge — both ranges
  agree on identity.
- A new untracked file (never committed) shows `A`.

---

### Scenario : `.gitignore` filter and Show ignored toggle

**Priority** : SHOULD

**Preconditions** :
- A workspace with a `.gitignore` matching at least `node_modules/`
  and `dist/`. Both folders exist on disk.

**Steps** :
1. Open the Files tab.
2. Observe the eye-icon toggle in the tab header (right side, before
   the refresh button).
3. Click the eye toggle on.
4. Click it again.
5. Switch to another workspace and back.

**Expected** :
- Step 1 (default, eye-off) : `node_modules/` and `dist/` are omitted
  from the tree.
- Step 3 : the icon flips to eye, the tree re-fetches, gitignored
  entries appear with muted opacity (~50 %).
- Step 4 : the toggle returns to eye-off ; gitignored entries hide.
- Step 5 : after returning, the toggle has reset to the default
  (eye-off) — no DB persistence in v0.0.1.

**Edge cases** :
- No `.gitignore` in the project → all files visible regardless of
  the toggle state.
- A nested `.gitignore` in a subfolder is respected.

---

### Scenario : Files tab refresh button triggers a single re-fetch

**Priority** : COULD

**Preconditions** :
- Files tab active. Tree populated.

**Steps** :
1. Click the circular-arrow refresh button in the Files tab header.

**Expected** :
- The tree re-runs `list_repository_tree` once (verify via dev logs).
- While the request is in flight, the button is disabled.
- The existing tree stays visible — no flash of empty.
- On completion, the button re-enables and the tree updates in place.

**Edge cases** :
- Re-fetch errors → button re-enables ; error banner appears
  (Scenario : Files tab errors surface inline).
- Click while in-flight (button disabled) is a no-op.

---

### Scenario : Live FS watcher updates the tree with 200 ms debounce

**Priority** : MUST

**Preconditions** :
- A workspace open with the Files tab visible.

**Steps** :
1. From a separate real terminal, `touch <workspace-root>/new.txt`.
2. From the same terminal, run a bursty operation
   (e.g. `pnpm install`) in the worktree.
3. `rm <workspace-root>/new.txt`.

**Expected** :
- Step 1 : within ~250 ms (200 ms debounce + tick), `new.txt` appears
  with badge `A`.
- Step 2 : the tree re-renders ONCE per debounce window, not per FS
  event (verify via dev counters).
- Step 3 : `new.txt` disappears within ~250 ms.

**Edge cases** :
- `lsof | grep inotify` stays stable after navigating through several
  workspaces and back — no watcher leak.
- A symlink pointing outside the worktree does not propagate
  notifications.

---

### Scenario : Watcher lifetime tracks the active workspace

**Priority** : MUST

**Preconditions** :
- Two workspaces : A and B, each with at least one file.

**Steps** :
1. Open A. Note a file in its tree.
2. Switch to B via the sidebar. Confirm B's tree loads.
3. From a real terminal, modify a file in A's worktree.
4. Stay on B. Observe.
5. Switch back to A.

**Expected** :
- Step 4 : B's tree does NOT refresh ; A's watcher was cancelled
  when A lost focus.
- Step 5 : A's tree re-fetches on mount and the modification appears.
  A new watcher is now active for A.

**Edge cases** :
- Rapid back-and-forth switches do not leak file descriptors.
- Closing the app cancels all watchers cleanly (no zombie inotify
  handles).

---

### Scenario : Files tab errors surface inline

**Priority** : SHOULD

**Preconditions** :
- A workspace selected. Force a failure by deleting the worktree on
  disk (destructive — only run on a throwaway project).

**Steps** :
1. Refresh the Files tab.
2. Recover (recreate the worktree or switch to a healthy workspace).
3. Re-open the Files tab.

**Expected** :
- Step 1 : the tree area shows "Failed to load: <error message>" in
  destructive color. The list area itself is empty.
- Step 3 : the next successful fetch clears the error and shows the
  tree.

**Edge cases** :
- Transient I/O error → next refresh recovers.
- Permissions error → the message includes the offending path.
