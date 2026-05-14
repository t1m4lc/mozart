# Mozart — Sidebar, Dashboard & State Coherence Specification

> **Scope** : v0.0.1 MVP — Phase 1 (the visible left + center
> chrome of the app), with hooks for Phases 2-6.
> **Purpose** : specify the left sidebar's structure and
> behavior, the dashboard's three-card landing screen, the state
> coherence rules that govern what's visible based on workspace
> selection, the popover card shown on workspace hover, and the
> context menus on project / workspace rows.
>
> **Architectural placement** :
>
> - The dashboard is the **route component** at `/`
>   (`pages/dashboard.page.ts`).
> - The sidebar is the **shell-level** component
>   (`shell/sidebar/`), composed of dumb components from
>   `libs/ui` where reusable and smart wrappers for state.
> - The popover card is a dumb `libs/ui` component
>   (`libs/ui/workspace-card-popover.component.ts`).
> - State coherence is a **routing + layout concern** of the
>   `AppShell` component, driven by `WorkspaceFacade.selected()`.
>
> **Companion specs** :
>
> - `plan.md` Phase 1 owns the data model + flow for project /
>   workspace creation, and the cross-cutting tech conventions
>   (Signal Forms for every form in this doc, Lucide icons,
>   `dayjs`).
> - `composer-timeline-ui.md` owns the composer (hidden when no
>   workspace selected, per state coherence rules below).

---

## 1. Dashboard `/`

### 1.1 When it shows

The dashboard renders when no workspace is selected — i.e. the
route is `/` (root). After auth (Phase 5) and onboarding
(Phase 6), the user lands here on every app launch unless their
last session restores them into a workspace (a session-restore
mechanic that the data layer can opt into ; Phase B decides).

### 1.2 Layout

Centered in the middle column. Three large clickable cards in a
single horizontal row, with a heading above.

```
                  ┌─────────────────────────┐
                  │      Get started        │
                  │  Open or create a       │
                  │  project to begin       │
                  └─────────────────────────┘

  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  Folder  │    │  Github  │    │ Sparkles │
  │          │    │          │    │          │
  │  Open    │    │  Clone   │    │  Quick   │
  │  project │    │  from    │    │  start   │
  │          │    │  GitHub  │    │          │
  └──────────┘    └──────────┘    └──────────┘
```

Cards are equal-sized, centered with a max container width, ample
gap between them, generous internal padding.

### 1.3 Card content

| Card                | Lucide icon   | Title               | Subtitle                                           |
| ------------------- | ------------- | ------------------- | -------------------------------------------------- |
| Open project        | `folder-open` | "Open project"      | "Pick a local folder"                              |
| Open GitHub project | `github`      | "Clone from GitHub" | "Clone a repo to your machine"                     |
| Quick start         | `sparkles`    | "Quick start"       | "New folder, GitHub repo, and workspace in one go" |

### 1.4 Card 1 — Open project

Click → triggers the OS folder picker via the projects adapter.

Flow :

1. User picks a folder.
2. The Phase 1 add-project flow takes over (validate → check git
   status → if non-git, show §2 _"Initialize project"_ dialog →
   persist → auto-create workspace + chat → navigate to the new
   workspace).

### 1.5 Card 2 — Clone from GitHub

Click → opens the _"Clone GitHub repo"_ dialog (`HlmDialog`).

**Dialog title** : _"Clone GitHub repo"_

**Form** (Signal Forms) :

- **Repository URL** input. Validation : pattern
  `^https?://github\.com/[\w-]+/[\w.-]+(\.git)?$`. On invalid :
  the `Clone repo` button is disabled and an info line under the
  input reads _"Please enter a valid GitHub URL (https://github.com/owner/repo)"_.
- **Location** : grouped input (Spartan grouped-input pattern)
  with a text input default to `/Users/{name}/mozart/repos` and a
  `Browse` button that opens the system folder picker in
  directory-select mode.
- Below the location input, an info line :
  _"Will clone to {location}/{repo-name}"_ — derived live from
  the URL + location.

**Buttons** : `Cancel` / `Clone repo` (primary, Enter shortcut).

**Action on submit** :

1. Validate the URL one more time.
2. Run `git clone {url} {location}/{repo-name}` via the projects
   adapter.
3. The cloned folder is then handed off to the standard add-
   project flow (which auto-creates a workspace + chat and
   navigates).

If the destination directory already exists, the dialog surfaces
an inline error and refuses to submit.

### 1.6 Card 3 — Quick start

Click → opens the _"Create a project"_ dialog (`HlmDialog`).

**Dialog title** : _"Create a project"_
**Subtitle** : _"Create a local folder, private GitHub repo, and
first workspace"_

**Form** (Signal Forms) :

- **Project name** input. Validation : non-empty, alphanumeric +
  dashes (kebab-case suggested ; sanitize on blur to enforce).
- **Parent folder** : grouped input with text default
  `/Users/{name}/mozart/projects` and `Browse` button (directory
  picker).
- **Template** : radio cards (custom dumb component, see §1.7) :
  - `Empty` (selectable) — creates a new folder with a styled
    `README.md` (project title + brief blurb) and a sensible
    `.gitignore` (Node-default for v0.0.1).
  - `gstack (SOON)` — disabled, with the _"Coming soon"_ badge.
    When eventually enabled, will clone
    https://github.com/garrytan/gstack as the starter.

**Buttons** : `Cancel` / `Create` (primary).

**Action on submit** :

1. Create the directory at `{parent-folder}/{project-name}`.
2. Populate per template :
   - `Empty` : `README.md` + `.gitignore` (Node).
3. Run `git init` + initial commit.
4. If GitHub is connected (Phase 5) : create a private GitHub
   repo `{user}/{project-name}`, add as `origin`, push to `main`.
5. Hand off to the standard add-project flow (auto-creates a
   workspace + chat and navigates).

### 1.7 `RadioCard` (new dumb component in `libs/ui`)

The Template selector uses a `RadioCard` pattern that doesn't
exist in Spartan's primitives. New composed dumb component in
`libs/ui/radio-card/` :

- Each card : icon + title + subtitle + optional badge
  _"(SOON)"_, _"(BETA)"_, etc.
- Disabled state when `disabled` input is true.
- Selected state with accent border + accent background tint.
- Click anywhere on the card → selects it.

Public surface :

```ts
type RadioCardOption = {
  id: string;
  icon: string;        // Lucide name
  title: string;
  subtitle?: string;
  badge?: string;      // 'SOON' | 'BETA' | etc.
  disabled?: boolean;
};

// Inputs
options:    InputSignal<RadioCardOption[]>;
selectedId: InputSignal<string | null>;
// Output
(selectionChange: string)
```

Phase B of the relevant phase confirms if Spartan added a
`RadioGroup` with card-style options ; if so, reuse over rebuild.

---

## 2. _"Initialize project"_ dialog (non-git folder)

Triggered automatically when the user adds a folder that isn't a
git repository.

**Dialog title** : _"This folder isn't a git repository.
Initialize it?"_

**Explanation paragraph** :

> _"Mozart will run `git init` to create a repository in this
> folder. If you're connected to GitHub, Mozart can also create
> a private GitHub repo, add it as origin, and push to the main
> branch."_

**Form** (Signal Forms, **only visible if GitHub is connected**) :

- **Owner** — default to the connected GitHub username. Dropdown
  if the user has access to multiple orgs / owners (multi-owner
  is post-MVP per `plan.md` — in MVP this is just the username,
  read-only).
- **Repository name** — default to the folder name (basename).
- Inline info line under the inputs :
  _"will create `{owner}/{repo-name}`"_ — with a check icon if
  the name is available on GitHub, a warning icon if it's taken.
  The availability check is debounced (400 ms) and uses the
  GitHub adapter.

**Buttons** : `Cancel` / `Initialize the project` (primary).

**Action on submit** :

1. Run `git init` in the folder.
2. Run `git add . && git commit -m "Initial commit via Mozart"`.
3. If GitHub connected : create the private repo, add as
   `origin`, push to `main`.
4. Proceed with the normal add-project flow.

---

## 3. Sidebar

### 3.1 Layout

```
┌─────────────────────────────────┐
│ [macOS window controls]         │
├─────────────────────────────────┤
│ [back] [forward] [history]      │
│            [search ← deferred]  │
├─────────────────────────────────┤
│ Projects             [+ Add]    │
│   ▾ project-alpha               │
│       ◦ bob-marley-1  (active)  │
│       ◦ radiohead-2             │
│   ▸ project-beta                │
│                                 │
│                                 │
│       (empty space below)       │
│                                 │
├─────────────────────────────────┤
│ [Help]              [⚙ Settings]│
└─────────────────────────────────┘
```

The macOS window controls slot at the top is platform-conditional
(visible on macOS only ; Linux / Windows render the title bar in
the OS chrome).

> **Post-MVP** : a `Chats` group below `Projects` with all chats
> chronologically + a `+ New ask chat` button. The `system
workspace` pattern is also post-MVP. See `plan.md` post-MVP
> section.

### 3.2 Header row — back / forward / history / search

A row of icon buttons :

- `back` (`arrow-left`) — navigate back in the in-app history
- `forward` (`arrow-right`) — navigate forward
- `history` (`clock-rewind` or similar) — opens a popover with a
  reverse-chronological list of recently visited workspaces /
  chats, each with relative date
- `search` (`search`) — **deferred post-MVP**, button can be
  present but disabled with tooltip _"Coming soon"_ in MVP

### 3.3 Projects group

- Group title row : _"Projects"_ (left) + `[+ Add a project]`
  (right, `HlmButton` `ghost` variant, icon `plus`).
- Right-click on the group title opens the **group context
  menu** (§5.1).
- Click on `[+ Add a project]` :
  - **Option (a)** : routes to `/` (dashboard) so the user picks
    via the three cards.
  - **Option (b)** : opens the three cards directly as a
    `HlmDialog`.
  - Phase B picks (depends on whether the dashboard always
    remains accessible via direct click on Mozart logo / home).
  - Mon défaut for Phase B : (a) — routing back is cleaner, the
    dashboard is the canonical entry point.

### 3.4 Project rows

Each project is a collapsible section :

- Click on the project name → toggles expand / collapse
- Default expanded for the active project ; default collapsed
  for others (Phase B refines based on UX preference)
- Right-click → project context menu (§5.2)
- Hover → no special popover in MVP (post-MVP : a richer hover
  preview)

When a project is being created (Quick start in progress) or
git-cloned (Clone GitHub in progress), the row shows a subtle
spinner next to its name.

### 3.5 Workspace rows

Each workspace under an expanded project :

- Layout : `[branch-icon] [workspace-name-or-chat-title]`
- **Branch icon** : Lucide `git-branch` by default ; replaced by
  a **cli loader** (animated dots or a small spinner) when one
  of the workspace's chats is currently streaming.
- **Workspace name vs chat title** : if the workspace's active
  chat has a `generated_title` (populated by Phase 3+ once the
  agent has produced enough context to summarize), display
  **that title** instead of the workspace name (better reflects
  user intent). The `generated_title` is persisted on
  `chats.title` (see `plan.md` Phase 2 schema).
  - Fallback hierarchy : `chats.title` → `workspace.name`
- **Bold** if the workspace has unread messages
  (`max(messages.created_at) > chats.last_read_message_id` for
  any of the workspace's chats — `plan.md` Phase 2).
- **Hover** → after a 500 ms delay, opens the popover card (§4).
- **Active state** : the currently routed-to workspace
  (`/workspaces/:id` matching) gets a subtle background tint +
  border-left accent (the existing pattern in the codebase per
  user feedback — keep it).
- **Right-click** → workspace context menu (§5.3).
- **Click** → navigates to that workspace.

### 3.6 Footer row — Help & Settings

Two buttons at the bottom :

- `Help` (Lucide `circle-help`) → opens a dropdown menu
  (`HlmDropdownMenu`) with four items, **all disabled in MVP**
  with a tooltip _"Coming soon"_ :
  - _"Documentation"_ (external link)
  - _"Keyboard shortcuts"_ (in-app dialog)
  - _"Report a bug"_ (external link)
  - _"Contact support"_ (external link)
- `Settings` (Lucide `settings`) → routes to `/settings`.

The Help dropdown items are wired post-MVP, but the surface is
in place from MVP.

---

## 4. Workspace popover card

Triggered on hover on a workspace row in the sidebar (after a
500 ms delay).

### 4.1 Layout

```
┌────────────────────────────────────────┐
│ bob-marley-1                  ● running│
│ Add dark mode toggle to settings page  │
│ Tested the toggle in light mode, now…  │
│                              2 min ago │
└────────────────────────────────────────┘
```

### 4.2 Content (top to bottom)

- **Row 1** : workspace name (bold) + status indicator (right-
  aligned colored dot + label : `● idle` / `● running` /
  `● changed` / `● failed`).
- **Row 2** : active chat title (single line, truncated with
  ellipsis if too long).
- **Row 3** : last LLM response (one line, truncated).
- **Row 4** : relative date of the last activity
  (`dayjs().fromNow()` — _"just now"_, _"2 min ago"_).

### 4.3 Public surface

Dumb component in
`libs/ui/workspace-card-popover.component.ts` :

```ts
type WorkspaceCardPopoverData = {
  workspaceName: string;
  status: 'idle' | 'running' | 'changed' | 'failed';
  activeChatTitle: string | null;
  lastResponse: string | null;
  lastActivityAt: Date | null;
};

// Input
data: InputSignal<WorkspaceCardPopoverData>;
```

No outputs ; it's a pure display component.

### 4.4 Trigger primitive

Use Spartan `HlmHoverCard` for the trigger + content pattern.
The host (the workspace row in the sidebar) wraps the row in the
trigger, mounts the popover as the content.

### 4.5 Position

Side : `right`. The popover appears to the right of the sidebar,
not overlapping the middle column content significantly. Phase B
confirms with actual visual checks.

---

## 5. Context menus

All context menus use Spartan `HlmContextMenu`.

### 5.1 Projects group context menu (right-click on the group title)

Items :

- _Expand all_ — expand every project row
- _Collapse all_ — collapse every project row
- _Create project…_ — opens the Quick start dialog (§1.6)
- _Filters…_ — **disabled in MVP** with tooltip _"Coming soon"_

### 5.2 Project row context menu (right-click on a project)

Items (preserve what already exists in the codebase per user
feedback ; audit confirms) :

- _Rename project_
- _Remove from Mozart_ — does NOT delete the folder from disk ;
  just removes the project row + cascades to its workspaces
- _Open folder in Finder_ (macOS) / _in Explorer_ (Windows) /
  _in Files_ (Linux)
- _Open in IDE_ — uses the last-used IDE (Phase 4)
- _Add a workspace_ — creates a new workspace (alternative to
  the `+` button on hover, post-MVP polish)

Whatever the current codebase has, **preserve unless explicitly
broken**.

### 5.3 Workspace row context menu (right-click on a workspace)

Items (per user spec) :

- _Mark as read_ — sets `last_read_message_id` on all of this
  workspace's chats to the latest message, clears the unread
  bold
- _Pin_ — pin this workspace to the top of its project's list
  (Phase B decides whether pinned workspaces stay in their
  project or move to a separate group)
- _Set status →_ sub-menu :
  - _Idle_ / _Running_ / _Changed_ / _Failed_ — manual override
    of the automatic status (rare use case but possible)
- _Rename_
- _Archive_ — soft-delete (sets `archived_at` ; workspace no
  longer appears in the sidebar but data is preserved). A
  separate _"Archived workspaces"_ view is post-MVP.

> **Destructive actions** like _Discard all changes_ (revert to
> base branch) and _Delete permanently_ are **deferred
> post-MVP** — they need a careful confirm workflow.

---

## 6. State coherence — workspace selection

This is the rule that governs what's visible in the middle and
right columns based on whether a workspace is currently selected.

### 6.1 Source of truth

`WorkspaceFacade.selected()` — a signal exposed by the workspaces
domain that returns the currently routed-to workspace, or `null`.

Resolved from the route param `/workspaces/:id`. When the route
is anything else (`/`, `/settings`, future `/projects/:id` etc.),
the signal is `null`.

### 6.2 Visibility rules

| Element                                                  | When `selected()` is `null`           | When `selected()` is set |
| -------------------------------------------------------- | ------------------------------------- | ------------------------ |
| Left sidebar                                             | ✅ visible                            | ✅ visible               |
| Settings gear (bottom of sidebar)                        | ✅ visible                            | ✅ visible               |
| Help button (bottom of sidebar)                          | ✅ visible                            | ✅ visible               |
| Dashboard 3 cards (middle column)                        | ✅ visible when route is `/`          | ❌ hidden                |
| Breadcrumb header (top of middle column)                 | ❌ hidden                             | ✅ visible               |
| Workspace tab bar                                        | ❌ hidden                             | ✅ visible               |
| Composer                                                 | ❌ hidden                             | ✅ visible               |
| Header right buttons (`Open in IDE`, future commit / PR) | ❌ hidden                             | ✅ visible               |
| Right aside (Phase 4 : Files / Terminal / Run tabs)      | ❌ entirely hidden (column collapses) | ✅ visible               |

> **Right aside fully collapses** when no workspace is selected
> — not just empty. The grid layout switches from 3 columns to 2.

### 6.3 Implementation

`AppShell` is the component that owns the conditional. It reads
`WorkspaceFacade.selected()` and conditionally renders the
middle column's chrome + the right aside.

```ts
@Component({
  selector: 'app-shell',
  template: `
    <div class="grid" [class.has-workspace]="selected() !== null">
      <app-sidebar />
      <main>
        @if (selected()) {
          <app-breadcrumb />
          <app-workspace-tab-bar />
        }
        <router-outlet />
        @if (selected()) {
          <app-composer />
        }
      </main>
      @if (selected()) {
        <app-aside />
      }
    </div>
  `,
})
export class AppShell {
  protected readonly selected = inject(WorkspaceFacade).selected;
}
```

The CSS grid uses `grid-template-columns: auto 1fr` when
`has-workspace = false` and `auto 1fr auto` when `true`.

### 6.4 Transitions

Toggling between selected / unselected is **instant** (no fade)
in MVP. Smooth transitions can be added post-MVP if needed.
`prefers-reduced-motion` is honored regardless.

---

## 7. Architectural placement summary

```
apps/desktop/src/app/
├── pages/
│   └── dashboard.page.ts                   # / route, the 3 cards
│
├── shell/
│   ├── app-shell.ts                        # smart, state coherence
│   ├── sidebar/
│   │   ├── feature-sidebar.ts              # smart wrapper of libs/ui sidebar
│   │   ├── feature-project-list.ts         # smart : projects + workspaces tree
│   │   ├── ui-project-row.ts               # dumb
│   │   ├── ui-workspace-row.ts             # dumb, uses HoverCard for popover
│   │   └── ui-sidebar-header.ts            # dumb : back/forward/history/search
│   ├── breadcrumb/
│   │   └── feature-breadcrumb.ts           # smart : reads selected workspace
│   └── header-buttons/
│       └── feature-header-buttons.ts       # smart : Open in IDE etc.
│
└── domains/
    ├── projects/                            # add / list / context menu actions
    └── workspaces/                          # active workspace state

libs/ui/
├── radio-card/                              # new for Quick start template
├── workspace-card-popover/                  # new for the hover card
└── (existing : tab-bar, empty-state, composer, timeline)
```

---

## 8. Anti-regression checks

1. **State coherence enforced** : a test (or grep) confirms that
   the composer, breadcrumb, tab bar, header buttons, and right
   aside are conditionally rendered based on
   `WorkspaceFacade.selected()`, not on any other signal.
2. **Sidebar facade gate** : the sidebar feature components
   inject only `ProjectFacade` and `WorkspaceFacade`, never the
   underlying stores or adapters.
3. **No `Chats` group in MVP** : `grep -rn "Chats\|ask-chat"
apps/desktop/src/app/shell` returns zero matches (the group
   is post-MVP).
4. **Dialogs use Signal Forms** : `grep -rn "FormGroup\|FormControl\|FormBuilder"`
   in the project / dashboard dialogs returns zero matches.
5. **Popover via `HlmHoverCard`** : `libs/ui/workspace-card-popover`
   imports `HlmHoverCardModule` or equivalent ; no custom hover
   plumbing.

---

## 9. Open questions for Phase B

1. **Active workspace at boot** : restore last-active from
   session, or always start at `/` ? Recommend : start at `/`
   for v0.0.1 MVP (simpler), session-restore in a later phase.
2. **`[+ Add a project]` button behavior** : route to `/` vs
   open dialog ? Recommend routing to `/` (preserves a single
   canonical entry point for project creation).
3. **Project expand/collapse default** : last-active project
   expanded, all others collapsed ? Or remember per-project
   state ? Recommend : last-active expanded only ; per-project
   state is a post-MVP nicety.
4. **Right aside hide-when-no-workspace** : column entirely
   removed from grid (recommended, more honest layout) vs
   width-collapsed to 0 (faster CSS transition) ? Recommend
   removed from grid.
5. **Multi-owner GitHub** in §2 — MVP is single-owner
   (connected username). Phase B confirms whether to show the
   dropdown skeleton already or just a read-only input.
