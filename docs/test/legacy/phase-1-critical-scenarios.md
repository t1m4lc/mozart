# Phase 1 — Critical functional scenarios

Source of truth for the v0.0.1 / Phase 1 user-visible behaviors that
**must** keep working between commits. Until a real e2e suite exists,
treat this as the manual smoke-test checklist for any PR that touches
the add-project flow, the dashboard, the sidebar, or the workspace
shell. When `e2e` is wired (post v0.0.1), each scenario here should
get a Playwright spec; the section IDs are stable so the spec name
can mirror them (`s1_first_launch.spec.ts`, etc.).

> Run `pnpm reset-db ; pnpm dev` before the first scenario so the
> harness starts from a known empty state.

---

## S1 — First launch (DB empty)

- `/` shows the Dashboard with 3 large cards in a single row: Open
  project / Open GitHub project / Quick start.
- Left sidebar visible: Projects group ("No projects yet."), Chats
  group ("No chats yet.").
- No right aside, no breadcrumb, no tab bar, no composer.
- Help icon (footer-left) is rendered but disabled.
- Settings gear (footer-left) routes to `/settings`.

## S2 — Open existing git repo

1. Click "Open project" card.
2. System folder picker opens. Pick a folder that is already a git
   repository.
3. Project row appears in the sidebar (display name = folder basename).
4. A workspace is auto-created, named after a musician
   (`coltrane`, `bjork`, `tupac`, …).
5. Route advances to `/workspaces/:id`.
6. Right aside appears. Tab bar shows a single tab titled `Start`.
7. Branch picker shows `mozart/<name>` pinned as "current" at the
   bottom, disabled and focus-skipped; the active target branch
   (default `main` when present) is highlighted at the top.
8. If the repo has a `package.json`: the empty-state step 4 reads
   "Installing dependencies with <pm>…" with a CLI loader.
   When install finishes, it reads "Installed dependencies with <pm>."

## S3 — Open non-git folder (init flow)

1. Click "Open project" card.
2. Pick an empty folder that is not a git repository.
3. Dialog opens: "This folder isn't a git repository. Initialize it?"
4. `Cancel` returns to the Dashboard with no project added.
5. `Initialize the project` runs `git init --initial-branch=main`,
   creates an initial empty commit, then proceeds with the same
   auto-workspace + first-chat flow as S2.

## S4 — Clone GitHub repo

1. Click "Open GitHub project" card on the Dashboard **OR** the
   "Open GitHub project" item in the sidebar `+ Add a project`
   dropdown — both open the same dialog.
2. Dialog `Clone GitHub repo` opens with two inputs.
3. URL: `https://github.com/anthropics/anthropic-sdk-python`.
4. Location field is pre-filled with `<home>/mozart/repos` (OS-appropriate separator).
5. `Browse` button opens the folder picker rooted at the current
   Location value; picking a different folder updates the field.
6. `Cancel` closes; `Clone repo` runs `git clone <url>
   <location>/<derived-name>` and continues with the standard
   add-project flow.
7. Cloning the same URL into the same Location twice surfaces a
   "destination already exists" inline error; the dialog stays open.

## S5 — Quick start

1. Click "Quick start" card (Dashboard) **OR** sidebar dropdown.
2. Dialog `Create a project` opens.
3. Inputs: Name (autofocused) + Parent folder (default `<home>/mozart/repos`)
   + Browse button + Template radio.
4. Template: `Empty` is selected; `gstack` is rendered but disabled
   with a "Soon" badge.
5. `Create` makes `<parent>/<name>` on disk, runs `git init` +
   initial commit silently (no second confirmation), continues with
   the auto-workspace + first-chat flow.
6. Creating into an existing target surfaces an inline error.

## S6 — Sidebar Chats group

After at least one workspace exists:

- Below Projects, a `Chats` group is rendered with the heading and a
  disabled `+ New ask chat` button (tooltip "Coming in Phase 2").
- Chats are bucketed: Today / Yesterday / This week / Older.
- Each entry shows the chat title (initially `Start`).
- Click on a chat row navigates to its workspace.
- The chat row matching the currently-viewed workspace is highlighted
  as active.

## S7 — Tab differentiation

In any workspace:

- The first tab is `Start`. Its empty-state shows the workspace-init
  checklist (info / branched from / files ready / setup / sparkles).
- Clicking the `+` adds a tab. The first new tab is `Untitled`, the
  next `Untitled2`, then `Untitled3`, etc. Numbering is local to the
  workspace.
- Switching to an `Untitled*` tab shows the light empty-state:
  "Ready when you are — what should we do next?"
- Switching back to `Start` shows the init checklist.
- Up to MAX_TABS (4) tabs total. The `+` button disables at the cap.
- After tab create or change, the composer textarea is auto-focused.

## S8 — Branch picker

In the workspace toolbar:

- The picker icon opens a Combobox.
- The currently-selected target branch is the first item, highlighted.
- The workspace's own branch (`mozart/<name>`) is the last item,
  disabled, labelled with `current` + a `Tab` keyboard-shortcut hint.
- Both the current target and the current branch are skipped during
  keyboard navigation — only "other" branches are focusable.
- When the worktree has no other branches the list shows an empty
  state "No other branches available."

## S9 — Workspace row affordances

In the sidebar:

- Row shows the workspace name with the `lucideGitBranch` icon. If a
  generated chat title exists, that title is rendered instead.
- When a chat has unread messages, the row text is bold.
- While an agent run is streaming for this workspace, the branch
  icon is replaced by a centered animated-dots CLI loader.
- Hover for 1000ms opens a hover popover positioned to the right of
  the row. Popover content: status dot + workspace name + status
  label + chat title + relative date ("just now", "2 minutes ago",
  …) refreshed against the latest user message timestamp.

## S10 — State coherence

- `/` → Dashboard, no aside, no chrome.
- `/workspaces/:id` → full chrome, right aside visible.
- `/workspaces` (no `:id`) → 301-equivalent redirect to `/`.
- When the left sidebar is collapsed (header toggle), the Dashboard
  still shows a top-right toggle button to bring it back. Same for
  the Welcome state.

## S11 — Add-project idempotency

- Clicking "Open project" and selecting a folder that already
  resolves to a registered project (same canonical path) does NOT
  create a duplicate. It navigates to the first existing workspace
  of that project.
- The same holds for Clone (already-cloned destination → error
  surfaces; user picks a different name) and Quick start
  (destination-exists guard).

## S12 — Restart safety

- Restart the app via the OS window controls (or `pnpm dev` reboot).
- Sidebar repopulates with the previously added projects + workspaces.
- The sidebar Chats group repopulates from the DB.
- Branch policy: existing workspaces created before the Phase 1
  branch-prefix migration keep their original `agent/<slug>` branch
  names in the DB; newly created workspaces use `mozart/<name>`.
  No migration of existing rows.

---

## Non-goals for Phase 1 (do NOT block on these)

- Multiple chats per workspace beyond the local tab bar (Phase 2).
- GitHub OAuth + private-repo creation in the Init dialog (Phase 2).
- Sidebar "+ New ask chat" actually opening a chat (Phase 2 — system
  workspace for non-contextualised chats).
- Workspace status kanban (UI exists in the data model; surface comes
  later).
- Real package-install progress streaming (current impl awaits the
  full install before flipping the empty-state step).
