# Phase 4 (4a + 4b) — Critical functional scenarios

Source of truth for the Phase 4a (right-aside chrome) and Phase 4b
(workspace file tree) user-visible behaviors that **must** keep working
between commits. Same status as `phase-1-critical-scenarios.md`: manual
smoke-test checklist until an e2e suite lands; section IDs are stable
so future Playwright spec names can mirror them
(`s4a1_aside_chrome.spec.ts`, etc.).

> Run `pnpm reset-db ; pnpm dev` (or `pnpm tauri dev`) before the first
> scenario so the harness starts from a known empty state.
> Some scenarios mutate files in a real worktree — pick a throwaway
> project (or restore via `git checkout .` afterwards).

Out of scope here:
- Diff view (Phase 4c).
- Terminal / Run tabs (Phase 4d / 4e).
- IDE detection + launch + Commit dialog + Push-to-PR (Phase 4f).

---

## S4a-1 — Right aside renders only inside a workspace

1. Fresh launch on `/`. **Right aside is hidden** (no panel beyond the
   main column).
2. Add a project + open a workspace. **Right aside slides in** at
   320px wide.
3. Click the toolbar's right-panel toggle. Aside collapses; click
   again, aside re-opens.
4. Navigate back to `/` (Dashboard) via the sidebar. Aside hides.
5. Open a workspace again. Aside re-appears with the previously
   active tab (URL-driven — see S4a-3).

## S4a-2 — Aside header chrome

In any workspace:

- A read-only **branch badge** sits left of the header, showing the
  workspace's own branch (e.g. `mozart/coltrane`). Hover tooltip:
  "Branch for this workspace". Long branch names truncate.
- An **Open in IDE** split button sits right of the header. Primary
  segment shows the last-used tool's icon + the workspace name (when
  there's room); the chevron opens a dropdown with all tools.
  Selecting a tool flips the primary button label.
- A **Commit** button (ghost, with commit icon) sits at the far right,
  **disabled** with tooltip "Commit changes (coming soon)".
- The **toolbar no longer hosts** the Open-in split button (Phase 4a
  moved it). The toolbar still has breadcrumb, branch picker, optional
  CLI loader, and the right-panel toggle.

## S4a-3 — Active tab persisted in URL

1. Click the **Run** trigger. URL becomes
   `#/workspaces/<id>?tab=run`. Reload — Run still active.
2. Click the **Terminal** trigger. URL becomes `?tab=terminal`.
3. Click **Files** (default). The `tab` query param **clears** (no
   `?tab=files`). Reload — Files active.
4. Browser back/forward navigates between the tab states.
5. Switch to a different workspace via the sidebar — `?tab` resets to
   default (the new URL has no `tab` param) so the new workspace lands
   on Files.

## S4a-4 — Tabs render placeholder copy for Terminal / Run

- **Files** tab: file tree (see S4b-* scenarios).
- **Terminal** tab: muted-foreground text "Terminal coming soon."
- **Run** tab: muted-foreground text "Run coming soon."

These placeholders confirm the tab strip wires correctly even before
4d/4e land.

---

## S4b-1 — Files tab renders the worktree

1. Open a workspace. Files tab is active by default.
2. Tree shows the workspace's files and folders, **rooted at the
   project's worktree but only relative paths visible** — no absolute
   path leaks anywhere in the UI.
3. Folders render with `lucideFolder` (closed) / `lucideFolderOpen`
   (expanded), files render with `lucideFile`. A chevron indicates
   collapse state on folders.
4. Sort order: directories first, then alphabetical (case-insensitive)
   within each level.
5. Empty repo (only `.git/`) shows: "No files yet."
6. Long paths truncate with the row's ellipsis; full filename surfaces
   via the row's title attribute.

## S4b-2 — A / M / D status badges against base branch

Setup: a workspace whose agent (or the user) has touched files
relative to `base_branch`.

- A file added since `base_branch` (committed or untracked) shows the
  badge `A` (secondary variant).
- A file modified shows `M` (secondary variant).
- A file deleted shows `D` (destructive variant — red tone).
- Unchanged files show **no badge**.
- The badge sits at the right edge of the row; hover surfaces the
  full label ("Added" / "Modified" / "Deleted").
- Status precedence: working-tree state wins on overlap with the
  committed range. Example: a file added in a commit on the workspace
  branch then deleted from the working tree shows `D`, not `A`.

## S4b-3 — `.gitignore` filtering and the Show ignored toggle

1. Files tab header has an eye-icon button (right side, before the
   refresh button).
2. Default (eye-off icon): entries matched by `.gitignore` are
   **omitted** from the tree (no `node_modules/`, `dist/`, etc.).
3. Click the toggle. Icon flips to eye. Tree re-fetches; gitignored
   entries appear, rendered with **muted opacity** (~50%).
4. Click again to hide. Default state is preserved per component
   instance (no DB persistence — toggle resets when the workspace is
   re-opened).

## S4b-4 — Click on a file emits selection (no diff yet)

1. Click a file row.
2. No visible UI change (4c will mount the diff view).
3. The browser devtools console logs:
   `[aside] file selected: <relative path>`.
4. Click on a folder row. The folder expands/collapses; **no
   selection event fires** for folders.

## S4b-5 — Refresh button triggers a single re-fetch

1. Click the circular-arrow button in the Files tab header.
2. The tree re-runs `list_repository_tree` once.
3. While the request is in flight, the button is disabled and the
   header shows the existing tree (not a flash of empty).

## S4b-6 — Live FS watcher picks up changes

Setup: workspace open with Files tab visible.

1. From a separate real terminal, `touch` a new file inside the
   workspace's worktree.
2. Within ~250ms (200ms debounce + ~tick), the new file appears in
   the tree with the `A` badge.
3. `rm` the file. It disappears within the same window.
4. Run a real bursty operation (e.g. `pnpm install` in the worktree).
   The tree re-renders **once** per debounce window, not per FS event.
5. Verify no inotify leaks across workspace switches — `lsof | grep
   inotify` should stabilise around the same count after navigating
   between several workspaces and back.

## S4b-7 — Watcher lifetime: switch workspace → switch back

1. Open workspace A. Note a file in its tree.
2. Switch to workspace B via the sidebar. Files tab re-loads with B's
   tree.
3. From a real terminal, modify a file in workspace **A**'s worktree.
4. Workspace B's tree does **not** refresh (the A-side watcher was
   cancelled when the workspace switched).
5. Switch back to workspace A. Tree re-fetches and the modification
   shows up. A new watcher is now active for A.

## S4b-8 — Errors surface inline

1. Force a failure (e.g. delete the worktree on disk while it's
   selected — destructive, only run on a throwaway project).
2. Refresh the Files tab. The tree area shows
   `Failed to load: <error message>` in destructive color.
3. Recover (re-create the worktree or switch to a healthy workspace);
   the next successful fetch clears the error.

---

## Vocabulary discipline (anti-regression)

These strings must **not** appear in the rendered DOM of the right
aside or the file tree at any point in the scenarios above:

- `worktree`, `worktree_path`
- `branch_name`, `base_branch`
- `HEAD`, `refs/heads`, `detached`

If any of them surfaces (toolbar, badge, tooltip, error message),
treat it as a regression — adapter mappers must strip these before
they reach the components.

---

## Non-goals for Phase 4a + 4b (do NOT block on these)

- Diff view, file selection effect, side-by-side panel — Phase 4c.
- Terminal session, PTY persistence across navigation — Phase 4d.
- Run command + status indicator — Phase 4e.
- IDE detection (the Open-in dropdown still uses the static
  `OPEN_IN_TOOLS` array; clicking a tool currently flips
  `lastUsedTool` but doesn't actually launch — Phase 4f).
- Commit / Push-to-PR dialog wiring — Phase 4f.
- Per-user persistence of the Show-ignored toggle — current behavior
  is per-component-instance, which is intentional for v0.0.1.
- Virtualised tree rendering for very large repos — out of scope;
  CDK virtual-scroll can layer on later if perf bites.
