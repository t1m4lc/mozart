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
- No string in the visible UI contains "worktree", "HEAD", "detached",
  "refs/heads", "HEAD~1", "agent/wip-".
- Branch names render as `bowie-1` etc., not as `agent/wip-bowie-1`.

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
