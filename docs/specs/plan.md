# Mozart — Incremental delivery plan (v0.0.1 → v0.0.2)

This document breaks down the v0.0.1 and v0.0.2 deliveries into vertical,
demoable steps.
Each step is:

- **user-feature oriented**: there's something to demo at the end
- **additive**: no step breaks the previous ones
- **faithful to the target architecture**: v1.0.0 conventions (vocabulary,
  internal Task, centralized worktree paths) are respected from day one

The ordering is designed so that at every milestone you have something to
show someone, even if not everything is wired yet.

```
1. Bootstrap & shell → app opens, 3-column shell visible, routing works
2. Projects           → user can add a local project
3. Workspaces         → user can create a workspace (worktree + branch)
4. Persistent chat    → user can type a message and see it rendered
5. LLM streaming      → assistant streams its response (agentic, edits files)
6. Settings           → Claude connection is visible and manageable
```

---

## Methodology — plan first, code second

> **Mandatory rule** : every step starts in **Claude Code plan mode**
> and is split into two phases :
>
> 1. **Phase A — Code reconnaissance** (always done, always real).
>    Read the affected paths, inventory what already exists, surface
>    blockers. **Do not invent ; do not paper over gaps.**
> 2. **Phase B — Plan** (depth scales with the step's UX surface).
>    Confirm UX micro-decisions and the implementation plan based on
>    Phase A findings.
>
> Only after both phases are validated do you exit plan mode and
> implement.

### Why two phases

`plan.md` is the architectural intent. It's true at the **strategic**
level — domains, layers, conventions, file lists, DoD. It's **not** a
ground-truth snapshot of the codebase at the moment you implement a
given step. Between steps, the code evolves :

- `libs/ui` gains new primitives **and composed dumb components**
- Adapter signatures and DTOs shift as the Tauri side adds commands
- New conventions emerge in earlier steps that should propagate
- `legacy/` may reveal patterns or quirks we want to preserve (or
  explicitly reject)

Pretending the spec is the truth = silent drift, integration bugs,
duplicated UI components, hand-rolled adapters that don't match what
Tauri actually exposes. Phase A prevents this.

### Phase A — Code reconnaissance (mandatory for every step)

Before proposing anything, the agent must read and inventory :

1. **`libs/ui`** — both **primitives** (Spartan wrappers : button,
   icon, dialog…) AND **composed dumb components** already built
   (cards, items, list rows, message bubbles, …). Rule : if it
   already exists, **use it**. Don't recreate a "project card" if
   `libs/ui` already exposes one that fits.
2. **The Tauri side** for any IO this step touches. Inventory the
   actual command names, their parameter shapes, and their return
   types. Adapter signatures + DTOs are derived from **what Tauri
   exposes**, not from what `plan.md` guesses.
3. **Existing domains** (if any from earlier steps) for the facade /
   store / adapter conventions that crystallized. New domains copy
   the latest pattern, not the spec's idealized version.
4. **`legacy/`** for any prior implementation that informs route
   names, copy, edge cases, or naming. Reference only — no imports.
5. **`plan.md` for this step** to anchor the strategic intent.

Output of Phase A : a short structured report :

```
### Already exists, will reuse
- libs/ui : <component> for <purpose>
- <existing facade / adapter / util>

### Tauri inventory
- Available commands : <name(args) → return> ...
- DTOs already shaped on the Rust side : ...

### Blockers / gaps
- <thing> assumed by plan.md but not present : impact = ...
- DTO mismatch between TS and Rust on <field> : impact = ...
- Need new Tauri command : <suggested signature>

### Proposed adapter signatures + DTOs
- interface XAdapter { ... }
- type XDTO = { ... }
```

**Blockers must be surfaced**, not worked around. "I'll just write a
custom dumb component because the existing one doesn't quite fit" is
the wrong answer. The right answer is : "the existing dumb component
is missing X — should I extend it in `libs/ui` first, or do you
accept a domain-local override for this step ?"

### Phase B — Plan (depth scales with the step)

Once Phase A is validated, plan the implementation. Depth depends on
the step's UX surface :

| Step type                                                                | Phase B depth                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Mechanical (e.g. Bootstrap, CRUD over Tauri, simple list)                | **Light** — confirm 3-5 UX micro-decisions, propose file list                                                         |
| UX-rich (chat composer, streaming with structured segments, diff layout) | **Full** — interactions, states, edge cases, copy, error states, all states drawn from Phase A's available primitives |
| Risky / new pattern (first domain, first adapter, first agent stream)    | **Full + design-by-example** — at least one code-level sketch of the trickiest part                                   |

### Practical loop

1. Enter plan mode
2. **Phase A** : read code, output the reconnaissance report
3. Wait for review of Phase A — adjust assumptions, unblock blockers
4. **Phase B** : propose the implementation plan (file list, adapter
   signatures, key templates, UX calls)
5. Wait for approval
6. Exit plan mode, implement
7. Run the step's Definition-of-done checks

This applies to **every step** in v0.0.1 and v0.0.2 — and to every
sub-step (4a, 4b, …) when the sub-step touches a new boundary
(adapter, DTO, primitive). The small steps are where assumptions
silently diverge.

### What goes in each step's prompt

With this methodology in `plan.md`, each step's prompt becomes short :
load the `@` context, point at the step in `plan.md`, and ask the
agent to "follow the methodology" — i.e. run Phase A, then Phase B,
then implement. The prompt does NOT need to re-list the conventions,
the rules, or the constraints. They live here.

---

## Foundational convention #1 — UI comes from `libs/ui`

**Hard rule** : every UI primitive AND every reusable dumb component
is imported from `libs/ui`. Domain code composes what `libs/ui` already
exposes ; it never rebuilds a control, a card, or a list row that
already lives there.

### Two layers inside `libs/ui`

`libs/ui` evolves continuously. It contains :

1. **Primitives** — thin Spartan NG (shadcn-for-Angular) wrappers
   listed below. These are stable building blocks.
2. **Composed dumb components** — higher-level pure presentational
   components built from primitives (e.g. a generic list row, an icon
   card, a connection card, a tab strip with copy slots, …). These
   evolve fast.

**Phase A of every step (see Methodology) must inventory both layers.**
If a composed component already exists for the use case, reuse it. If
one almost fits but needs a tweak, extend it inside `libs/ui` —
**don't fork it inside a domain**. A domain-local override is a last
resort and must be flagged explicitly to the reviewer.

### Available primitives in `libs/ui` (Spartan NG, stable layer)

```
Accordion        Alert            Alert Dialog     Aspect Ratio
Autocomplete     Avatar           Badge            Breadcrumb
Button           Button Group     Calendar         Card
Carousel         Checkbox         Collapsible      Combobox
Command          Context Menu     Data Table       Date Picker
Dialog           Dropdown Menu    Empty            Field
Hover Card       Icon             Input Group      Input OTP
Input            Item             Kbd              Label
Menubar          Native Select    Navigation Menu  Pagination
Popover          Progress         Radio Group      Resizable
Scroll Area      Select           Separator        Sheet
Sidebar          Skeleton         Slider           Sonner (Toast)
Spinner          Switch           Table            Tabs
Textarea         Toggle           Toggle Group     Tooltip
```

Reference docs (upstream Spartan) : https://www.spartan.ng/components/<name>

> Note : the exact exported symbols, selectors, and import paths in
> `libs/ui` may not 1:1 mirror the upstream Spartan API. Phase A of
> every step **must read `libs/ui` directly** to confirm.

### Composed dumb components in `libs/ui` (evolving layer)

This layer is not enumerated here because it changes between steps.
**Read `libs/ui` in Phase A of every step** to inventory what's
available. Typical citizens : list rows, icon cards, status pills,
connection cards, toolbar buttons, etc. — anything pure
presentational that's used in more than one place.

**Currently known composed components in `libs/ui`** (non-exhaustive,
verify in Phase A) :

- **`WorkspaceTabBar`** — horizontal tab strip under the breadcrumb,
  chat tabs with LLM icon + title + active violet border. Max 4 tabs.
  Hover reveals pen (rename) and close icons. Close disabled while a
  tab `isStreaming`, hidden when only one tab left. A pinned
  "New chat" button on the far right. Supports a future `file` tab
  variant (different icon, no rename, no close). State is owned
  internally by the component ; consumers pass `tabs[]`, `activeTabId`,
  and listen for create/close/rename/activate events.
- **`ChatEmptyState`** — empty-state panel rendered in the chat area
  when the active chat has no messages. Contains a workspace callout
  ("You are in a new chat of _{project}_ called _{workspace}_") and a
  3-row info list (Branch info with `<kbd>` chips, files count, setup
  script status).

When a step needs UI that overlaps with these, **reuse them**. If a
near-fit is missing a small variant, extend `libs/ui` rather than
forking the component locally.

### For lower-level behavior, use Angular CDK

For concerns Spartan doesn't directly cover — drag & drop, overlay
positioning, virtual scrolling, focus trap, portals, layout breakpoints,
selection lists, text-field autosize, accessibility live-announcer, etc.
— use `@angular/cdk` directly. Reference :
https://material.angular.dev/cdk/categories

Typical CDK modules we'll reach for in Mozart :

- `@angular/cdk/overlay` — custom popovers, command palette
- `@angular/cdk/drag-drop` — file tree reordering, tab reordering
- `@angular/cdk/scrolling` — virtual scroll for long file trees / chat
- `@angular/cdk/a11y` — focus trap inside dialogs, live announcer
- `@angular/cdk/portal` — content projection across the shell
- `@angular/cdk/layout` — responsive breakpoints

### Composition rule

Domain-level `ui-*` components are **composers** of Spartan + CDK
primitives. They never reinvent a button, a dropdown, or an overlay.
They glue primitives together with domain-specific layout, copy, and
state binding.

Example — a `ui-workspace-list-item.ts` is :

```ts
@Component({
  selector: 'app-workspace-list-item',
  imports: [HlmButton, HlmBadge, HlmIcon],
  template: `
    <button hlmBtn variant="ghost" (click)="select.emit()">
      <hlm-icon name="branch" />
      <span>{{ workspace().name }}</span>
      <hlm-badge variant="secondary">{{ workspace().branch }}</hlm-badge>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceListItem {
  workspace = input.required<Workspace>();
  select = output<void>();
}
```

The exact import paths depend on how `libs/ui` is structured ; treat the
above as illustrative of the **composition pattern**, not the exact API.

### When a primitive is missing

If a step needs a primitive that doesn't exist yet in `libs/ui` :

1. Stop. Don't inline a custom one.
2. Add the primitive to `libs/ui` first (wrap the Spartan source, or
   wrap a CDK behavior) as a small standalone PR.
3. Then consume it in the domain.

This rule has no exceptions — including for "just a small toggle" or
"only used once". The cost of a one-off custom primitive is a
divergent design system later.

### Anti-regression check

A grep across `domains/**/*.ts` and `pages/**/*.ts` for raw HTML form
controls (`<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`)
should return matches **only** in files that explicitly comment why
(e.g. inside a Spartan wrapper itself). Domain code uses the wrappers.

---

## Foundational convention #2 — Adapter & DTO discipline

The frontend never speaks raw Tauri / IPC / HTTP. It speaks **adapter
interfaces** that live next to the domain. The shape of every adapter
method and every DTO is **derived from what the Tauri side actually
exposes**, not from what the spec imagines.

This convention is the single biggest source of silent bugs : if the
TS adapter says `pickFolder(): Promise<string>` but the Rust command
returns `{ path: string, name: string, is_repo: bool }`, the parsing
explodes the first time a real user clicks the button. Phase A
catches this before it lands.

### Adapter shape

```ts
// domains/<x>/data/<x>.adapter.ts
import { InjectionToken } from '@angular/core';

// 1. DTOs — types describing the wire shape from/to Tauri.
//    Co-located in this file (or split if many).
export type PickFolderResult =
  | { ok: true; path: string; isRepo: boolean }
  | { ok: false; reason: 'cancelled' | 'invalid' };

// 2. The interface — Angular-friendly verbs.
export interface ProjectsAdapter {
  pickFolder(): Promise<PickFolderResult>;
  insert(input: { name: string; path: string }): Promise<Project>;
  list(): Promise<Project[]>;
}

// 3. The token — how features and stores get the impl.
export const PROJECTS_ADAPTER =
  new InjectionToken<ProjectsAdapter>('PROJECTS_ADAPTER');
```

The concrete `TauriProjectsAdapter` is implemented in the same
`data/` folder (typically as `tauri-projects.adapter.ts`) and is
**the only file in the app** that imports `@tauri-apps/api/core` for
this domain. It's registered as a provider in `app.config.ts`.

### DTO rules

1. **DTOs are derived from Tauri**, not invented in TS. Phase A
   inventories the Rust command signatures (parameters + return
   types) and **the TS DTOs mirror them exactly** — same fields, same
   types, same nullability, same casing convention agreed with the
   Rust side (typically `snake_case` on the wire converted to
   `camelCase` in the adapter impl).
2. **DTOs live in the adapter file**, not in `data/<entity>.model.ts`.
   Models are the domain-internal shape — they may be simpler, richer,
   or differently named than the DTO.
3. **The adapter impl is the only place that maps DTO ↔ domain model.**
   Features and stores see only domain models.
4. **Discriminated unions for failure modes.** Adapters never throw
   for expected outcomes (user cancelled, validation failed, …) ;
   they return a tagged result. They throw only for unexpected /
   programmer errors.

### Phase A blocker template for adapters

When an adapter is in scope, Phase A's report must include :

```
### Tauri commands inventory
- command_a(params) -> return_type
- command_b(params) -> return_type

### Proposed adapter signatures
interface XAdapter {
  ...
}

### Proposed DTOs (mirror of wire shape)
type CommandAResult = { ... }

### Mapping DTO -> domain model
- CommandAResult.foo_bar -> Model.fooBar
- CommandAResult.is_valid -> Model.valid

### Blockers
- command_b returns `bool` but we need a reason for failure : ask
  Rust side to return `{ ok: bool, reason?: string }` OR accept the
  limitation and surface a generic error message
```

Without this report, no adapter is written.

### Anti-regression checks

- `import.*@tauri-apps/api` appears **only** in `*-tauri.adapter.ts`
  files inside `domains/*/data/`. Zero matches elsewhere in domain
  or shell code.
- Features and stores never import DTO types from the adapter file —
  they import domain models from `<entity>.model.ts`. Grep for
  cross-imports of `*.adapter.ts` types outside the same `data/`
  folder.

---

## Foundational convention #3 — Intra-domain architecture

This section formalizes the structure inside a single domain folder.
Inspired by `angular-architects/flights42` (`domains/ticketing`) and
the Sheriff layer model.

### Folder layout

```
domains/<domain>/
├── feature-<feature>/         smart, container, route- or shell-level
│   ├── <feature>.ts           (the component)
│   ├── <feature>.html         (only if template > 40 lines)
│   └── <sub-component>.ts     (private to this feature)
│
├── ui-<ui-name>/              dumb, presentational, reusable in domain
│   └── <ui-name>.ts           (or .ts directly if no sub-files)
│
├── data/
│   ├── <entity>.model.ts      types only, no Angular
│   ├── <entity>.store.ts      NgRx signalStore — INTERNAL
│   ├── <domain>.facade.ts     public API to features — EXPORTED
│   ├── <name>.adapter.ts      interface + InjectionToken for IO
│   └── <name>.service.ts      pure domain logic (rare)
│
├── util-<helper>/             pure functions, no Angular, no IO
│   ├── <helper>.ts
│   └── <helper>.spec.ts
│
└── index.ts                   public API barrel
```

Flattening rule applies : if a folder would contain a single file,
collapse it to that file at the domain root (e.g. `ui-workspace-card.ts`
instead of `ui-workspace-card/workspace-card.ts`).

### Layer responsibilities

| Layer          | What it owns                                                                       | What it must NOT do                                                                        |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **feature-\*** | Composition, routing, orchestration of state, side effects via facade calls        | Direct DI of stores or adapters ; raw HTTP/IPC ; pure helpers (push them down)             |
| **ui-\***      | Presentation, accessibility, animation, layout. Pure `input()` in, `output()` out. | Inject anything from `data/` ; call facades ; hold long-lived state                        |
| **data/**      | Models, stores, facades, adapters. State + IO + domain rules.                      | Render UI ; depend on Angular components ; cross-domain calls (use shared)                 |
| **util-\***    | Pure helpers, formatters, validators, ID generators. Unit-tested in isolation.     | Anything Angular, anything stateful, anything async beyond returning a Promise from inputs |

### Dependency rules (recap from the architecture doc)

```
feature-*    → may use ui-*, data, util-*
ui-*         → may use data (for models/types only), util-*
data         → may use util-*
util-*       → no internal dependencies
```

Cross-domain : a domain **only imports from itself and `shared`**. The
`shell/` and `pages/` layers are the only places that may compose
multiple domains. When a domain needs to call another, it goes through
the other domain's `facade` (exposed via its `index.ts`).

### The Facade pattern

The facade is the **only** public entry point to a domain's data
layer. Features consume the facade ; they never inject the store or
the adapter directly.

```ts
// domains/workspaces/data/workspace.facade.ts
@Injectable({ providedIn: 'root' })
export class WorkspaceFacade {
  private readonly store = inject(WorkspaceStore);          // private
  private readonly worktree = inject(WORKTREE_ADAPTER);     // private
  private readonly tasks = inject(TaskFacade);              // cross-domain via facade

  // Public read surface — features consume these directly
  readonly all = this.store.workspaces;
  readonly selected = this.store.selected;
  readonly byId = (id: string) =>
    computed(() => this.store.byId(id));

  // Public write surface — features call these
  async createForPrompt(input: { projectId: string; prompt: string }) {
    const task = await this.tasks.create({ projectId: input.projectId, title: input.prompt });
    const name = generateWorkspaceName(this.store.takenNames());
    const branch = `mozart/${name}`;
    await this.worktree.create({ branch, workspaceName: name });
    return this.store.add({ taskId: task.id, name, branch });
  }

  archive(id: string) { /* … */ }
}
```

Rules :

- The facade is `@Injectable({ providedIn: 'root' })`
- It exposes **signals or computed signals** for reads — never raw
  store internals
- It exposes **methods** for writes — never the store's setters
- It coordinates store + adapter + cross-domain facades

### The Smart-component pattern (`feature-*`)

Smart components inject **only the facade**. They wire UI to state.

```ts
// domains/workspaces/feature-workspace-list/feature-workspace-list.ts
@Component({
  selector: 'app-feature-workspace-list',
  imports: [WorkspaceListItem, HlmButton],
  template: `
    @for (ws of workspaces(); track ws.id) {
      <app-workspace-list-item
        [workspace]="ws"
        (select)="select(ws.id)" />
    } @empty {
      <hlm-empty>No workspace yet</hlm-empty>
    }
    <button hlmBtn (click)="create()">New workspace</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureWorkspaceList {
  private readonly facade = inject(WorkspaceFacade);
  protected readonly workspaces = this.facade.all;

  protected select(id: string) { /* navigate */ }
  protected create() { /* prompt + facade.createForPrompt */ }
}
```

### The Dumb-component pattern (`ui-*`)

UI components have **no injection from `data/`**. They take inputs,
emit outputs, render. They are reusable across features within the
same domain.

```ts
// domains/workspaces/ui-workspace-list-item.ts
@Component({
  selector: 'app-workspace-list-item',
  imports: [HlmButton, HlmBadge, HlmIcon],
  template: `
    <button hlmBtn variant="ghost" (click)="select.emit()">
      <hlm-icon name="branch" />
      <span>{{ workspace().name }}</span>
      <hlm-badge variant="secondary">{{ workspace().branch }}</hlm-badge>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceListItem {
  workspace = input.required<Workspace>();
  select = output<void>();
}
```

### The Adapter pattern

Adapters wrap external IO (Tauri commands, HTTP, FS, IPC). The
interface lives in `data/` alongside an `InjectionToken`. The concrete
implementation is **provided in `app.config.ts`** at root.

```ts
// domains/workspaces/data/worktree.adapter.ts
import { InjectionToken } from '@angular/core';

export interface WorktreeAdapter {
  create(input: { branch: string; workspaceName: string }): Promise<void>;
  remove(workspaceId: string): Promise<void>;
}

export const WORKTREE_ADAPTER = new InjectionToken<WorktreeAdapter>('WORKTREE_ADAPTER');
```

```ts
// app.config.ts
providers: [
  { provide: WORKTREE_ADAPTER, useClass: TauriWorktreeAdapter },
]
```

Adapters are **private to their domain**. They are not re-exported via
`index.ts`. Tests can swap them with `provideValue(WORKTREE_ADAPTER, mock)`.

### The Store pattern (NgRx signalStore)

The store holds the domain's reactive state. It's **internal** to the
data layer — features never inject it. The facade is the gate.

```ts
// domains/workspaces/data/workspace.store.ts
export const WorkspaceStore = signalStore(
  { providedIn: 'root' },
  withState<{ workspaces: Workspace[]; selectedId: string | null }>({
    workspaces: [],
    selectedId: null,
  }),
  withComputed(({ workspaces, selectedId }) => ({
    selected: computed(() =>
      workspaces().find(w => w.id === selectedId()) ?? null),
    takenNames: computed(() => new Set(workspaces().map(w => w.name))),
  })),
  withMethods((store) => ({
    add(input: Omit<Workspace, 'id' | 'createdAt'>): Workspace { /* … */ },
    select(id: string) { patchState(store, { selectedId: id }); },
    /* … */
  })),
);
```

### The public API (`index.ts`)

Each domain's `index.ts` re-exports **only what other layers may
consume** :

```ts
// domains/workspaces/index.ts
export { FeatureWorkspaceList } from './feature-workspace-list/feature-workspace-list';
export { FeatureCreateWorkspace } from './feature-create-workspace/feature-create-workspace';
export { WorkspaceListItem } from './ui-workspace-list-item';
export { WorkspaceFacade } from './data/workspace.facade';
export type { Workspace } from './data/workspace.model';
// Stores, adapters, and util-* are NOT re-exported.
```

Other layers import via the alias :

```ts
import { WorkspaceFacade, type Workspace } from '@mozart/workspaces';
```

### Summary table — what goes where

| You need to …                                  | Put it in                        |
| ---------------------------------------------- | -------------------------------- |
| Render a route-level screen                    | `feature-*`                      |
| Compose a reusable block within a domain       | `ui-*`                           |
| Expose state to features and other domains     | `data/<x>.facade.ts`             |
| Hold reactive state                            | `data/<x>.store.ts` (internal)   |
| Talk to Tauri / IPC / HTTP                     | `data/<x>.adapter.ts` (internal) |
| Format a date, generate an ID, validate a name | `util-*` (pure)                  |
| Define a type                                  | `data/<entity>.model.ts`         |
| Let another layer use it                       | re-export in `index.ts`          |

---

# Mozart v0.0.1 — Minimal viable loop

## Step 0 — Tauri prerequisites (audit)

Before writing any Angular code, **inspect the existing Tauri code** and
list what's already in place. The scaffold assumes certain commands (or
equivalents) exist:

| Expected capability               | Expected Tauri commands (verify / map names)                   |
| --------------------------------- | -------------------------------------------------------------- |
| Read/write SQLite                 | `db_execute`, `db_query` (or `tauri-plugin-sql`)               |
| Pick a local folder               | `dialog::open` (dialog plugin)                                 |
| Check that a folder is a git repo | `git_is_repo(path)`                                            |
| Create a worktree                 | `git_worktree_create(repoPath, worktreePath, branch)`          |
| Remove a worktree                 | `git_worktree_remove(worktreePath)`                            |
| Stream an Anthropic response      | `anthropic_stream(messages)` emitting `anthropic_chunk` events |
| Read/write config (API key)       | `config_get`, `config_set` (or keyring)                        |

**Step 0 action**: produce a short `TAURI-INVENTORY.md` listing what
already exists, what's missing, and the mapping between the names expected
on the frontend and the actual Rust command names. The rest of the plan
assumes this mapping is known.

> **Rule of thumb**: the Angular frontend never reimplements logic already
> present in Tauri. The Angular adapter is a thin wrapper.

---

## Step 1 — Bootstrap & shell

### User goal

> _"I open the app and see a structured 3-column shell. I can navigate
> between an empty Workspace page and an empty Settings page. Nothing
> works inside them yet, but the chrome is there."_

### Scope

The **minimum runnable Angular app**. No domains, no stores, no
adapters. Just enough to render an empty shell and navigate.

Files created (exactly these — nothing else, **no `domains/` folder
yet**) :

```
apps/desktop/src/app/
├── main.ts
├── app.config.ts
├── app.routes.ts
├── shell/
│   ├── app-shell.ts
│   ├── shell-sidebar.ts
│   └── shell-aside.ts
└── pages/
    ├── workspace.page.ts
    └── settings.page.ts
```

Plus one edit :

- `tsconfig.json` → add `"paths": { "@mozart/*": ["apps/desktop/src/app/domains/*"] }`
  (the `domains/` folder doesn't exist yet — that's fine, the alias is
  ready for Step 2)

No `shell-content.ts` for now : the `<router-outlet />` lives directly
inside `AppShell`'s content column. Less indirection until we need it.

### What each file does

- **`main.ts`** : `bootstrapApplication(AppShell, appConfig)`
- **`app.config.ts`** : `provideRouter(appRoutes, withComponentInputBinding())`
- **`app.routes.ts`** :
  - `/` → redirect to `/workspaces`
  - `/workspaces`, `/workspaces/:id` → `WorkspacePage` (via `loadComponent`)
  - `/settings` → `SettingsPage` (via `loadComponent`)
- **`app-shell.ts`** : 3-column CSS grid, imports `ShellSidebar`,
  `ShellAside`, `RouterOutlet` ; renders `<router-outlet />` in the
  middle column
- **`shell-sidebar.ts`** : the column structure + a gear button at the
  bottom routing to `/settings` (uses `HlmButton` from `libs/ui` with
  `HlmIcon` for the gear) ; rest is a `<!-- TODO -->` placeholder
- **`shell-aside.ts`** : empty `<aside>` placeholder
- **`workspace.page.ts`**, **`settings.page.ts`** : page-level
  placeholders with their title

### UI primitives used

- `HlmButton` (gear button in the sidebar) — `libs/ui`
- `HlmIcon` (gear icon) — `libs/ui`

That's it. The empty page placeholders use plain text headings ; they
don't yet need primitives.

### Tauri side

Nothing.

### Sub-steps

1. **1a** — Plan mode : confirm the 9-file list, the route table, the
   CSS grid approach, and that the gear button uses `HlmButton`+`HlmIcon`
2. **1b** — Write the 9 files in one pass
3. **1c** — Add the tsconfig path mapping
4. **1d** — Verify build + dev open + navigation works

### Rules to enforce

- **No `domains/` folder yet.** Domains are created on demand by their
  step.
- The gear button is the only Spartan primitive in v0.0.1 step 1 —
  everywhere else is `<!-- TODO -->`.
- No CSS framework setup beyond what `libs/ui` already requires
  (Tailwind + Spartan themes should already be wired ; if not, this is
  where we fix it — confirm in plan mode).

### Definition of done

- [ ] Exactly 9 new files + 1 tsconfig edit
- [ ] `pnpm install && pnpm build` succeeds
- [ ] `pnpm tauri dev` opens a window with a visible 3-column layout
- [ ] Clicking the gear navigates to `/settings`
- [ ] `/workspaces` and `/workspaces/:id` swap to the workspace page
- [ ] No `@NgModule`, no `Component` suffix on class names
- [ ] No file references the `domains/` folder yet

---

## Step 2 — Add a project

### User goal

> _"I click 'Add a project', pick a local folder, it appears in the
> sidebar, and it's still there after restart."_

### Scope

- `projects/data/project.model.ts`: `{ id, name, path, addedAt }`
- `projects/data/project.store.ts`: signalStore with `projects: Project[]`
- `projects/data/project.facade.ts`: `add(path)`, `list()`, hydrates from SQLite on startup
- `projects/feature-add-project.ts`: button + opens the Tauri picker
- `projects/feature-project-list.ts`: list rendered in the sidebar
- `projects/ui-project-card.ts`: list item
- Persistence: `projects` table in SQLite

### UI primitives used (from `libs/ui`)

- `HlmButton` — "Add a project" action in the sidebar
- `HlmItem` or `HlmCard` — each project row in the list (whichever
  reads cleaner ; decide in plan mode)
- `HlmIcon` — folder icon next to the project name

### Tauri side

- `dialog::open({ directory: true })` for the picker
- SQLite commands: `projects_insert`, `projects_list`
- Schema: `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, path TEXT UNIQUE, added_at INTEGER)`

### Sub-steps

1. **2a** — Model + store + facade (no persistence yet, in-memory)
2. **2b** — "Add a project" button + Tauri picker → adds in memory
3. **2c** — Render in the sidebar (`feature-project-list`)
4. **2d** — SQLite persistence (insert + load on startup)

### Definition of done

- [ ] Clicking "Add a project" opens the system picker
- [ ] The project appears immediately in the sidebar
- [ ] Close/restart the app → the project is still there
- [ ] Adding the same folder twice does not create a duplicate

---

## Step 3 — Create a workspace

### User goal

> _"From a project, I create a workspace. A branch is created, a git
> worktree is created under `~/.mozart/worktrees/{id}/`, and the workspace
> appears in the sidebar. I can click on it."_

### Scope

- `tasks/data/task.model.ts`: `{ id, projectId, title, createdAt }`
- `tasks/data/task.store.ts`: signalStore with a `create()` method
- `workspaces/data/workspace.model.ts`: `{ id, taskId, name, branch, createdAt }`
- `workspaces/data/worktree.adapter.ts`: interface + token, **the only file that knows about worktree paths**
- `workspaces/data/workspace.facade.ts`: `createForPrompt({ projectId, prompt })` creates **Task + Workspace together**
- `workspaces/util-workspace-name.ts`: generates a friendly name (animal-adjective-XXX, avoiding collisions)
- `workspaces/feature-create-workspace.ts`: "New workspace" button in the sidebar (under the selected project)
- `workspaces/feature-workspace-list.ts`: rendered in the sidebar under the project
- `workspaces/ui-workspace-list-item.ts`: clickable item navigating to `/workspaces/:id`

### UI primitives used (from `libs/ui`)

- `HlmButton` — "New workspace" action under the selected project
- `HlmItem` — each workspace row in the sidebar list
- `HlmBadge` — the branch indicator on each row (`variant="secondary"`)
- `HlmIcon` — branch / status icon
- `HlmSkeleton` — placeholder while the worktree is being created

### Tauri side

- `git_worktree_create(repoPath, worktreePath, branch)`
- SQL schemas:
  ```sql
  CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, created_at INTEGER);
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    task_id TEXT UNIQUE,  -- 1:1 in v0.0.1, constraint relaxed in v0.1.0
    name TEXT,
    branch TEXT,
    worktree_path TEXT,   -- INTERNAL, never exposed to the UI
    created_at INTEGER
  );
  ```

### Sub-steps

1. **3a** — SQL schema + `tasks` table + `workspaces` table
2. **3b** — `task.store` + `workspace.store` (in-memory CRUD + persistence)
3. **3c** — `worktree.adapter` with a Tauri implementation injected in `app.config.ts`
4. **3d** — `workspace.facade.createForPrompt(...)` creating Task + Workspace + worktree atomically
5. **3e** — UI: button + sidebar list + navigation to `/workspaces/:id`

### Rules to enforce from this step on

- **Vocabulary**: **never** show "worktree", "HEAD", "refs/heads" in the
  UI. Use "workspace" and "branch" (as a badge).
- **Path**: every worktree path lives under `~/.mozart/worktrees/{id}/`.
  No file other than `worktree.adapter.ts` may reference this path.
- **Atomicity**: if worktree creation fails, the Task and Workspace must
  not be left in the DB. Wrap in a rollback.

### Definition of done

- [ ] From a project, I can create a workspace in one click
- [ ] The folder `~/.mozart/worktrees/{id}/` exists with a checkout of the repo
- [ ] `git branch` in the source repo shows the new branch
- [ ] The workspace appears in the sidebar; clicking navigates to `/workspaces/:id`
- [ ] A `tasks` row AND a `workspaces` row are in the DB, linked
- [ ] The word "worktree" appears nowhere in the rendered DOM

---

## Step 3.5 — Composer & Timeline UI in `libs/ui` (companion task)

> **Companion spec** :
> [`docs/specs/composer-timeline-ui.md`](./composer-timeline-ui.md).
> That doc owns the deep contract — public surfaces, sub-component
> structure, plan-mode visual treatment, file layout in `libs/ui`,
> open questions. Read it in Phase A. Visual specs of the timeline
> (shimmer, geometry, icons, file chips, diff stats) are owned by
> [`llm-stream-parser.md`](./llm-stream-parser.md) §6.

Companion `libs/ui` task between domain steps. **Strictly dumb
components**, no domain wiring, no facade injection, no Tauri. Pure
inputs / outputs. Lives in `libs/ui` so Steps 4 and 5 just mount it.

### User goal

> _"By the end of this task, `libs/ui` exposes a complete chat composer
> and a complete agent timeline. They render in a Storybook-like
> sandbox (or a route) with mock data ; both look right ; both react
> to events without any domain state behind them."_

### Why this is a separate task

The composer (with model picker, effort selector, plan-mode toggle,
context menu) and the timeline (with renderers, shimmer, file chips)
are **rich UI surfaces** with their own UX micro-decisions. Building
them alongside the chat domain in Step 4 / Step 5 would tangle dumb
UI work with persistence and streaming work and make both harder to
review.

Pattern matches what we already did for `WorkspaceTabBar` and
`ChatEmptyState` : ship the dumb UI in `libs/ui` first ; domain steps
mount it later.

### Scope — Composer

**Positioning** : `position: absolute` relative to the middle shell
column. Anchored to the bottom of that column, full width minus the
column's gutter padding.

**Textarea** :

- Placeholder : `"ask to make changes, @mention file, reference PR with #, run /commands"`
- Autosize : `cdkTextareaAutosize` (min 1 row, max 8 rows then
  internal scroll)
- Keyboard : Enter sends, Shift+Enter newline, Cmd/Ctrl+Enter optional
- In plan mode, the textarea has a distinct visual treatment
  (border + subtle bg ; spec it in Phase B)

**Bottom-left cluster — left to right** :

1. **`+` button → "Add context" menu**. Tooltip _"Add context"_.
   Opens a dropdown menu with three items, each with an icon + label :
   - `Paperclip` — _"Add attachment"_ → opens the OS file picker
   - `LinkSimple` — _"Link issue (GitHub or Linear)"_ → opens a
     submenu / dialog (Phase B picks pattern) prompting for issue URL
   - `Folder` — _"Link workspace"_ → opens a Spartan `Command` palette
     ("search workspace") seeded with the user's workspace list
     In Step 3.5 these are wired as `(event: AddContextAction)` outputs
     only ; the actual file-picker / palette logic comes when domains
     need it.

2. **Model selector** (uses `hlm-select` styled like the user's
   `hlm-dropdown-menu` sample). Tooltip _"Change model"_. Trigger
   shows the current model's icon + short name. Open content :
   - Models grouped by **provider** (Anthropic, OpenAI, OpenRouter,
     Local…) with a `hlm-dropdown-menu-label` per group
   - Each model row : provider icon + model name + optional
     `Badge` _"New"_ + a check indicator on the selected one
   - Right-aligned check (`hlm-select`'s built-in radio indicator)
     Inputs : `models: ModelOption[]`, `selectedModelId: string`.
     Output : `(modelChange)`.

3. **Effort selector**. Tooltip _"Adjust effort"_. Trigger shows a
   **graduation icon** + the current effort. Open content : a single
   group with five rows, each row's graduation icon scales with the
   level :
   `low | medium | high | xhigh | max`
   Inputs : `effort: EffortLevel`. Output : `(effortChange)`.

4. **"Enter plan mode" button** with the plan icon + label _"Plan"_.
   Tooltip _"Enter plan mode"_. When in plan mode :
   - Button stays visible, label still _"Plan"_, icon highlighted
   - Tooltip flips to _"Exit plan mode"_
   - The textarea's visual treatment changes (per Phase B)
   - Output `(planModeChange: boolean)` lets the host toggle state

**Bottom-right cluster** :

5. **Send button** (`HlmButton`, primary variant). Disabled when the
   textarea is empty (whitespace-only counts as empty) or while a
   message is already streaming in the current chat.
   Output `(send)` emits the trimmed value ; on success the
   composer clears (host triggers via input `clearOnSend`).

**Public surface (signal-based)**

```ts
// Inputs
value: InputSignal<string>;
disabled: InputSignal<boolean>;            // e.g. while streaming
models: InputSignal<ModelOption[]>;
selectedModelId: InputSignal<string>;
effort: InputSignal<EffortLevel>;
planMode: InputSignal<boolean>;
// Outputs
(valueChange)
(send)
(modelChange)
(effortChange)
(planModeChange)
(addContext)                                // tagged union of actions
```

The composer is a **single dumb component** (`Composer`) ; sub-parts
(`ComposerModelSelect`, `ComposerEffortSelect`, `ComposerPlanToggle`,
`ComposerContextMenu`, `ComposerSend`) are private to the component.
None of them know about facades.

### Scope — Timeline

There's already a Timeline in the codebase. Treat this step as a
**review + refactor** to match the parser-driven model. Phase A reads
the existing implementation and proposes either : refactor in place
or rebuild side by side with a deprecation path.

Target shape — strictly dumb, fed by a `TurnState` value :

```
<Timeline [state]="turnState()">          // pure input, no service
  <TurnHeader />                          // shimmer summary, chevron
  <TurnBody>
    <MessageBody />                       // streamed text
    @for (item of state.items; track item.id) {
      <TimelineItem [item]="item" />     // delegates to a renderer
    }
    @if (state.done) { <DoneMarker /> }
  </TurnBody>
</Timeline>
```

`TimelineItem` switches on `item.kind` (or `item.toolName`) and picks
a renderer via the registry. Available renderers in v0.0.1 :

- `FileReadRenderer` — file-text icon + file chip
- `FileEditRenderer` — file-pencil icon + file chip + diff stats
- `FileCreateRenderer` — file-plus icon + file chip
- `ShellRenderer` — terminal icon + stdout/stderr collapsible
- `SearchRenderer` — magnifying-glass icon + query summary
- `ThinkingRenderer` — clock icon + collapsible reasoning
- `GenericToolRenderer` — wrench icon + JSON input collapsible
- `DoneMarker` — check-circle + label _"Done"_
- `ErrorMarker` — x-circle + label _"Error"_

Visual specs (shimmer animation, geometry, icons, file chips, diff
stats) come from `docs/specs/llm-stream-parser.md`. Step 3.5 is the
**implementation** of those primitives ; Step 5 is the wiring.

**Loaders** :

- **Text loader** : while the streamed text portion is being emitted,
  show a subtle pulsing dot at the cursor position (CSS animation,
  respects `prefers-reduced-motion`).
- **Spinner** : `HlmSpinner` on a TimelineItem in ACTIVE state when
  no shimmer applies (e.g. shell command running with no text output).

### What's NOT in Step 3.5

- No parser, no reducer (those are Step 5, in `domains/llm-model/`)
- No real LLM connection
- No domain wiring (no facade, no signals from a store)
- No file-picker logic for the `+` menu (output an event ; the host
  in Step 5 / later wires the actual flow)
- No command-palette logic for `Link workspace` (same — output an
  event)

### UI from `libs/ui` (primitives used)

- `HlmButton` (composer buttons, send, plan mode)
- `HlmSelect` (model + effort selectors)
- `HlmDropdownMenu` (`+` context menu — keep model/effort as
  `HlmSelect` per request)
- `HlmTextarea` + `@angular/cdk/text-field` (composer textarea +
  autosize)
- `HlmTooltip` (every button)
- `HlmBadge` (the _"New"_ badge on model rows)
- `HlmCommand` (workspace search palette ; rendered on demand)
- `HlmIcon` + chosen icon library for the graduation icon set
- `HlmSpinner` (timeline ACTIVE state)
- `HlmCollapsible` (per-item expand/collapse)

### Phase A focus

- The existing Timeline implementation — files, API, what it accepts
  as input, what it imports. Decide refactor-in-place vs side-by-side.
- The `+` menu surface : is there already a context-menu primitive
  for this in `libs/ui` ?
- Icon library : which one is wired ? (the user's sample uses
  `@ng-icons/lucide` ; confirm the actual choice in the repo).
- `prefers-reduced-motion` plumbing : confirm a single source of
  truth (CSS media query, or an Angular signal from `cdk/a11y`).

### Phase B focus

- Final public-surface signatures for `Composer` and `Timeline`
  (input names, output payloads).
- The visual treatment of the textarea in plan mode.
- The pattern for the `+` menu's submenus (cascading menu vs sequential
  dialog vs route).
- Storybook-like sandbox route to demo both with mock data
  (Phase B confirms whether we use a real route in the app or a
  separate Storybook setup).

### Definition of done

- [ ] `Composer` exported from `libs/ui` with the full public surface
      listed above, all interactions working against mock state
- [ ] Plan mode toggle visually distinguishes the textarea
- [ ] Model selector renders grouped models with NEW badges and a
      checkmark on the selected
- [ ] Effort selector renders the five levels with graduation icons
- [ ] `+` menu opens with three items ; clicking each emits the
      right `addContext` event payload ; no real picker fires
- [ ] `Timeline` exported from `libs/ui` ; fed with a mock
      `TurnState`, renders correctly through all renderers
- [ ] All tooltips render with the strings specified above
- [ ] No facade or store import anywhere in this work
- [ ] `prefers-reduced-motion` removes shimmer + pulses ; expand /
      collapse stays functional (instantaneous)
- [ ] A sandbox route (or Storybook) demonstrates both components
      end-to-end

---

## Step 4 — Persistent chat (no LLM yet)

### User goal

> _"In a workspace, I see a chat tab bar (with one tab — `Untitled`)
> and an empty-state panel underneath. I type a message, hit Enter,
> the empty state disappears and the message appears. I can open a
> second chat tab in the same workspace. Messages persist across
> restarts."_

At this step, **the assistant does not respond yet**. This is
intentional : we isolate the persistence + tab plumbing from the
streaming mechanics (Step 5).

### Scope

Two halves : (a) data plumbing in `domains/chat/`, (b) mounting the
existing `WorkspaceTabBar` and `ChatEmptyState` from `libs/ui` and
wiring them to chat state.

**Domain `domains/chat/`** :

- `chat/data/chat.model.ts` : `{ id, workspaceId, title, llmId, createdAt }`
  - `title` defaults to `'Untitled'` ; later auto-generated from first
    user prompt (placeholder hook in Step 4, real generation in Step 5+)
  - `llmId` is `null` on a new chat ; set when the first LLM is used
- `chat/data/message.model.ts` : `{ id, chatId, role, content, status, createdAt }`
  - `status: 'sending' | 'done' | 'error' | 'streaming'` from day one
    (`'streaming'` unused in Step 4, but the type is closed so Step 5
    adds no schema change)
- `chat/data/chat.store.ts` + `chat/data/chat.facade.ts` :
  - `chatsForWorkspace(workspaceId): Signal<Chat[]>`
  - `messages(chatId): Signal<Message[]>`
  - `activeChatId(workspaceId): Signal<string | null>`
  - `loadForWorkspace(workspaceId)` — get-or-create at least one chat
  - `createChat(workspaceId)` — adds a sibling chat (multi-tab support)
  - `closeChat(chatId)` — soft-delete or hard-delete (TBD in Phase B)
  - `renameChat(chatId, title)`
  - `setActiveChat(workspaceId, chatId)` — persisted per workspace
  - `sendUserMessage(chatId, text)` — adds a user message
- `chat/feature-chat-tab-bar.ts` — smart wrapper. Reads tabs + active
  id from the facade ; passes them to the **existing
  `WorkspaceTabBar` from `libs/ui`** ; routes events back to facade
  methods.
- `chat/feature-chat-area.ts` — smart, renders either :
  - **`ChatEmptyState` from `libs/ui`** when the active chat has no
    messages
  - `feature-message-list` + `feature-composer` otherwise
- `chat/ui-message-list.ts` — internal dumb list of messages
  (or a `MessageList` composed component from `libs/ui` if Phase A
  finds one already there)
- `chat/feature-composer.ts` — textarea, send button, keyboard handling

**Page composition** : `pages/workspace.page.ts` finally wakes up. It
mounts (in order) the breadcrumb (TBD where), `feature-chat-tab-bar`,
then `feature-chat-area`.

### UI from `libs/ui` (reused, not rebuilt)

- **`WorkspaceTabBar`** — already implemented. Step 4 only writes the
  smart wrapper that connects it to `ChatFacade`.
- **`ChatEmptyState`** — already implemented. Step 4 passes it the
  project name, workspace name, branch info, files count, setup
  status. Some of these need DTOs from Tauri (branch info, files
  count, setup status) — Phase A inventories.
- **`Composer`** — built in Step 3.5. Step 4 mounts it via a smart
  wrapper that wires `value` ↔ local signal, `(send)` →
  `facade.sendUserMessage`, and surfaces (`modelChange`, `effortChange`,
  `planModeChange`, `addContext`) as `// TODO Step 5+` no-ops for now
  (or persists the selected model/effort per chat — Phase B decides).
- **`Timeline`** — built in Step 3.5. Not mounted in Step 4 (no
  streaming yet) ; verified to render with empty `TurnState` for
  forward-compat.
- `HlmScrollArea` — message list scroll container
- `@angular/cdk/text-field` — already in `Composer` via Step 3.5

### Tauri side

- SQL schema (forward-compatible from day one) :

  ```sql
  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,        -- NOT UNIQUE anymore : tab bar allows
                              -- N chats per workspace already in v0.0.1
    title TEXT NOT NULL DEFAULT 'Untitled',
    llm_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_chats_workspace ON chats(workspace_id);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,         -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    status TEXT NOT NULL,       -- 'sending' | 'done' | 'error' | 'streaming'
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);

  CREATE TABLE workspace_active_chat (
    workspace_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL
  );
  ```

  > Note : the `workspace_id UNIQUE` constraint mentioned in earlier
  > drafts is **dropped**. The tab bar from `libs/ui` already permits
  > up to 4 chats per workspace in v0.0.1, so the 1:1 invariant is
  > no longer accurate. The 1:1 cap was a v0.0.1 simplification that
  > no longer matches reality.

- Workspace introspection for the empty state — Phase A inventories
  whether these commands exist : `workspace_branch_info(id)`,
  `workspace_file_count(id)`, `workspace_setup_status(id)`. If
  missing, propose minimal additions.

### Sub-steps

1. **4a** — Schema + chat models + facade (in-memory, no Tauri yet)
2. **4b** — Mount `WorkspaceTabBar` + `ChatEmptyState` from `libs/ui`
   via thin smart wrappers ; verify the visual layout works
   end-to-end with mock data
3. **4c** — SQLite persistence : adapter + concrete Tauri impl ;
   load chats + messages + active chat id on workspace open
4. **4d** — Composer wired : Enter → `sendUserMessage` → persistence
   → store update → re-render ; empty state disappears on first send
5. **4e** — Tab interactions : new chat, rename, close, switch active

### Rules to enforce

- **No rebuilding `WorkspaceTabBar` or `ChatEmptyState`** — reuse from
  `libs/ui`. If something doesn't fit, extend `libs/ui`.
- The **smart wrappers in `domains/chat/`** own facade injection ;
  the dumb components from `libs/ui` stay pure (input / output).
- Forward-compat `messages.status` enum closed from day one.
- The 1:1 chat-per-workspace cap is **gone** — tab bar permits up to 4.

### Definition of done

- [ ] On arrival in a fresh workspace, the tab bar shows one `Untitled`
      tab and the chat area shows `ChatEmptyState` with correct
      workspace + branch + files info
- [ ] I type a message, press Enter, the empty state vanishes, the
      message appears
- [ ] Shift+Enter inserts a newline
- [ ] I click "New chat" → a second tab appears, switching tabs shows
      its own (empty) state
- [ ] Pen icon enters rename mode ; Enter saves ; Esc cancels
- [ ] Close icon removes a tab ; hidden when only one tab left
- [ ] Restart : tabs, messages, and active tab id are restored

---

## Step 5 — LLM streaming (agentic)

### User goal

> _"I type a question or a task, hit Enter. The assistant streams back
> a structured turn : a header summary with a shimmer animation, a
> collapsible vertical timeline below showing each thinking block and
> tool call as it happens, with file chips and diff stats on file
> edits. The agent simultaneously edits files in the workspace's repo
> on disk ; if I open the workspace in my IDE on the right branch, I
> see edits land live."_

### Critical context — Mozart is not a chatbot

The LLM endpoint on the Tauri side runs an **agent** (Claude Code or
similar) that uses tools : it reads files, writes files, runs commands,
all inside the workspace's worktree. The frontend's job is to :

1. **Receive the agent's stream** via a Tauri adapter
2. **Parse it** into a normalized `StreamEvent` union (provider-agnostic)
3. **Reduce events into a `TurnState`** (header summary, timeline
   items, statuses)
4. **Render the timeline** in a Claude.ai-style UI

In v0.0.1 we don't yet show file changes inside Mozart's UI (that's
v0.0.2 — right aside with file tree + diff). Users inspect changes via
an external IDE on the workspace's branch.

### Dedicated spec : the stream parser

Parser + reducer + rendering UI are detailed in a **separate
specification** : `docs/specs/llm-stream-parser.md`. That spec defines :

- The `StreamEvent` union and parser state machine
- The reducer producing `TurnState`
- The tool family → renderer registry (file-read, file-edit,
  file-create, shell, search, thinking, generic)
- UI components : turn container, header with shimmer summary,
  collapsible timeline, file chips, diff stats, done marker
- Plan mode : agent-emitted `plan_proposal` rendered as PENDING
  timeline items, awaiting user approve/cancel
- Visual specs (shimmer animation, timeline geometry, icons)

Treat that spec the same way `plan.md` is treated — source of truth
for parser/UI behavior. **Phase A of Step 5 must read it first.**

### Architectural placement

| Concern                                                                                             | Lives in                             |
| --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Provider-specific stream parsing (Anthropic first, OpenAI later)                                    | `domains/llm-model/data/stream/`     |
| Normalized `StreamEvent` union + reducer                                                            | `domains/llm-model/data/stream/`     |
| Tool renderer registry                                                                              | `libs/ui` (composed dumb components) |
| Timeline UI primitives (turn container, header, timeline, file chip, diff stats, done marker)       | `libs/ui` (composed dumb components) |
| Chat-side wiring (chat facade subscribes to stream, drives reducer, feeds `TurnState` to renderers) | `domains/chat/`                      |

The parser is **provider-aware** : it normalizes Anthropic's wire
format to `StreamEvent`. Future providers add sibling parsers in the
same folder. `llm-model` owns provider concerns — the parser belongs
there.

Renderers are pure presentational and reusable (the v1.0.0 review
panel may replay past turns) — they belong in `libs/ui`.

### Sub-steps — parser-first

The parser is a **separate, testable task** before the UI is wired.
It can be implemented and unit-tested with fixtures **before** any
chat integration.

**Track A — Parser (in `domains/llm-model/data/stream/`)**

1. **5a** — Anthropic stream fixtures : capture or synthesize sample
   raw event sequences (text-only turn, single tool call, multi-tool
   turn with thinking, error, network truncation, plan_proposal).
   Live in `__fixtures__/` next to the parser.
2. **5b** — `event.types.ts` : the `StreamEvent` union (per the
   parser spec).
3. **5c** — `anthropic.parser.ts` : pure function transforming raw
   Anthropic stream chunks → `StreamEvent`s. Unit-tested against
   every fixture. **No DOM, no Angular, no IO.**
4. **5d** — `reducer.ts` : pure function
   `(state: TurnState, event: StreamEvent) => TurnState`. Unit-tested.

**Track B — Tauri adapter (in `domains/llm-model/data/`)**

5. **5e** — `LlmAdapter` interface + DTOs derived from the actual
   Tauri command shape (Phase A inventories).
6. **5f** — `TauriClaudeAdapter` : subscribes to Tauri events, feeds
   them into `anthropic.parser`, exposes
   `stream(messages): AsyncIterable<StreamEvent>`.

**Track C — UI renderers (in `libs/ui`, only what's missing)**

7. **5g** — Phase A inventories which renderers already exist in
   `libs/ui` and which need to be added. Add the missing ones :
   `TurnContainer`, `TurnHeader`, `Timeline`, `TimelineItem`,
   `DoneMarker`, file-edit / file-read / file-create / shell /
   search / thinking / generic renderers, `FileChip`, `DiffStats`.
   Shimmer CSS lives next to `TurnHeader`.

**Track D — Chat integration (in `domains/chat/`)**

8. **5h** — `chat.facade.sendUserMessage(...)` enriched : adds the
   user message, creates an assistant message with empty `TurnState`,
   subscribes to the adapter's stream, runs the reducer, patches the
   `TurnState` signal on each event, sets
   `status: 'done' | 'error'` at the end.
9. **5i** — `feature-agent-message.ts` mounts `TurnContainer` from
   `libs/ui` with the `TurnState` signal.
10. **5j** — Error & resume semantics : missing API key, network
    error, app closed mid-stream (on restart the last assistant
    message in `status: 'streaming'` flips to `'error'` with an
    "interrupted" marker).

Tracks A and B can run in parallel from C. **Track A is the
recommended starting point** — it's pure, fixture-driven, and
quickly provides a solid foundation that doesn't depend on Tauri
being ready.

### UI from `libs/ui` (built or to build)

- **Existing** : `WorkspaceTabBar`, `ChatEmptyState` (both from
  Step 4), Spartan primitives.
- **To add for this step** : the agent timeline component family
  (see Track C). Confirm in Phase A which are missing.

For abstract behavior :

- `@angular/cdk/scrolling` — sticky-bottom auto-scroll on the message
  list (parser spec §5.4)
- `@angular/cdk/a11y` — `LiveAnnouncer` for screen-reader cues on
  status changes and errors

### Tauri side

- Verify the agent command exists and emits structured events. If it
  emits raw SSE text only, the Anthropic parser handles the SSE
  format directly — that's a legitimate path.
- Confirm the agent writes to `~/.mozart/worktrees/{workspaceId}/`.
- The API key is read from config (prepared in Step 6).

### Rules to enforce

- **Parser is pure.** No Angular, no Tauri, no IO. Input : provider
  chunks. Output : `StreamEvent[]`.
- **Reducer is pure.** No side effects, no DOM.
- **Adapter discipline** (Convention #2) : the Tauri adapter is the
  only file importing `@tauri-apps/api` for this domain. Provider
  chunks → `StreamEvent` happens inside the adapter, not the facade.
- **Timeline append-only during a turn** : items never reorder or
  disappear (parser spec §5.2).
- **Vocabulary** in tool-call summaries : "Edited 3 files in the
  workspace" — never "worktree", "HEAD", or "refs/heads".

### Definition of done

- [ ] Send "create a hello world README in the project" → header
      streams a shimmer summary, timeline shows a file-create item,
      the file exists on disk in the worktree after completion
- [ ] Opening the worktree in an IDE on the branch shows the agent's
      edits within seconds
- [ ] Multi-tool turn : each tool call appears as its own timeline
      item with the right icon (per renderer registry)
- [ ] Thinking blocks collapsed by default, expandable
- [ ] Plan mode : `plan_proposal` renders PENDING items + Approve /
      Cancel ; approval flips items ACTIVE → DONE as tools run
- [ ] Closing the app mid-stream → on restart the message is in
      `status: 'error'` with an "interrupted" marker
- [ ] No API key → clear error rendered as an `ErrorMarker` in the
      timeline
- [ ] Parser unit tests pass against every fixture

---

## Step 6 — Settings and connection status

### User goal

> _"I go to Settings. I see a 'Claude' card showing whether I'm connected.
> I can paste my API key. Once entered, the card turns green and the chat
> works."_

### Scope

- `profile/data/profile.model.ts`: `{ id }` (placeholder, fleshed out in v0.1.0)
- `profile/data/connection.model.ts`: `{ provider: 'claude', status: 'connected' | 'disconnected', lastCheckAt }`
- `profile/data/profile.store.ts`: holds the state of connections
- `profile/ui-connection-card.ts`: card with status + "Connect" button
- `profile/feature-connections.ts`: lists connections (just Claude in v0.0.1)
- `pages/settings.page.ts`: renders `feature-connections`
- Minimal dialog to paste the API key (can be a simple `prompt()` or a custom Angular dialog)

### UI primitives used (from `libs/ui`)

- `HlmCard` — the Claude connection card
- `HlmButton` — "Connect" / "Reconnect" / "Disconnect" actions
- `HlmBadge` — connection status pill (`connected` / `disconnected`)
- `HlmDialog` — the modal to paste the API key
- `HlmInput` (type=password) — the API key input inside the dialog
- `HlmLabel` — labels for the API key field
- `HlmAlert` — error feedback if the key is rejected

### Tauri side

- `config_get('anthropic_api_key')` / `config_set('anthropic_api_key', key)`
- Ideally stored in the system keyring (validate against what already exists)
- A `anthropic_check_connection()` command that attempts a minimal call
  and returns `ok | error`

### Sub-steps

1. **6a** — Read/write the key via Tauri (config or keyring)
2. **6b** — Connection card + "Connect" button → opens the key entry dialog
3. **6c** — On startup: `checkConnection()` then update the status
4. **6d** — When the key is entered, retry + update the status

### Definition of done

- [ ] The Settings page shows the Claude card with a clear status
- [ ] Without a key: status "Not connected", "Connect" button active
- [ ] After entering a valid key: status switches to "Connected"
- [ ] The key persists across restarts
- [ ] If I delete the API key and restart, status reverts to "Not connected"
- [ ] The chat works immediately after connecting, no app restart needed

---

## Recap: slice order and demos

| Step | Demo at the end                                                   |
| ---- | ----------------------------------------------------------------- |
| 1    | "The 3-column shell, navigation between empty pages"              |
| 2    | "I add my repo, it shows up in the sidebar, and stays"            |
| 3    | "I create a workspace, there's a new branch in my repo"           |
| 4    | "I can hold a conversation (no replies) and it persists"          |
| 5    | **"Mozart responds AND edits files. Core hypothesis validated."** |
| 6    | "I can manage my API key from the UI"                             |

Step 5 is when you have a **real product demo** : the agent talks and
acts. Steps 1–4 are foundations ; step 6 is finishing touches.

---

## Anti-regression checks to run continuously

At each step, verify the following invariants hold:

- **UI vocabulary**: grepping `worktree|HEAD|refs/heads|detached` across
  `.ts`/`.html` templates must return zero results (outside
  `worktree.adapter.ts`).
- **Worktree boundary**: only `worktree.adapter.ts` imports anything
  related to `~/.mozart/worktrees/...` paths.
- **Always-Task**: no Workspace is ever created without an associated Task.
  An integration test can assert `SELECT COUNT(*) FROM workspaces WHERE
task_id IS NULL` = 0.
- **OnPush everywhere**: grep for components missing
  `changeDetection: ChangeDetectionStrategy.OnPush`.
- **Cross-domain imports**: a file inside `domains/X/` only imports from
  `domains/X/`, `@mozart/shared`, or Angular/NgRx/CDK/`libs/ui` libs.
- **`libs/ui` discipline**: a grep for raw HTML form controls
  (`<button|<input|<select|<textarea|<dialog`) inside `domains/**` and
  `pages/**` should return only Spartan wrappers (`hlmBtn` directive on
  a native `<button>` is fine — that's the Spartan convention — but a
  bare `<button>` without `hlmBtn`/`hlm-...` is a violation).
- **Facade gate**: a grep for `inject(.*Store)` or `inject(.*Adapter)`
  outside `data/` returns zero matches. Features inject facades only.
- **Public API hygiene**: every domain's `index.ts` re-exports only
  features, ui components, facades, and exported types — never stores
  or adapter tokens.

Sheriff isn't in place yet (v0.1.0), but these rules can be checked
manually or via a small script.

---

## What we are NOT doing in v0.0.1 (reminder)

To prevent scope creep:

- No slash commands, no skills
- No `@` mentions, no context, no `@web`
- No MCP (the agent uses its built-in tools only — no user-registered MCP servers)
- No multi-chat per workspace (the schema allows it, the UI doesn't expose it)
- No file tree, no diff view, no terminal, no Run tab inside the aside
  (that's **v0.0.2** — the aside stays empty in v0.0.1, and the user
  inspects file changes via an external IDE)
- No "Open in IDE" button (also v0.0.2)
- No multi-provider (Anthropic only)
- No auto-workspace and no Mozart Core
- No GitHub PRs, no Linear, no PostHog
- No project templates
- No Sheriff (but the rules are followed manually)

All of these are **planned as additive** by the architecture. v0.0.1
sacrifices no future option; it just ships the minimal loop.

---

# Mozart v0.0.2 — Workspace inspection & execution

## Why v0.0.2 exists

After v0.0.1 ships, the user can chat with the agent and the agent edits
files in the workspace. But the **only way to see those edits** is to open
the worktree in an external IDE. The chat shows tool-call summaries, but
it's not a substitute for actually seeing a file tree, a diff, or a
running process.

v0.0.2 fixes that. It populates the right aside with the inspection +
execution surface the user needs to **observe and intervene** while the
agent works.

The strategic positioning : Mozart becomes the **control center** for the
agent's session. The user keeps their preferred IDE for actual code
authoring, but Mozart owns the observability and orchestration layer.

## Scope

### What's new

- **Right aside as a tabbed panel** with :
  - **Files** : tree of the workspace repo + per-file diff against the
    base branch
  - **Terminal** : sandboxed shell rooted at the workspace's worktree
    path, persisted across navigation
  - **Run** : execute a project-defined command (e.g. `npm run dev`) and
    view its output
- **Open in IDE** dropdown in the workspace header listing detected IDEs
  on the user's machine (VS Code, Cursor, JetBrains family, Zed, …) ;
  opens the workspace at the current branch
- **Live updates** : the file tree and diff refresh in real time as the
  agent edits files

### Still out of scope

Same exclusions as v0.0.1, with these clarifications :

- Still no MCP, no skills, no slash commands, no `@` mentions
- Still 1 chat per workspace
- The diff view is **read-only** (no hunk-level apply/revert — that's
  review/merge work, v1.0.0)
- No multi-run, no test runner integration, no debug
- No custom aside tabs — the three tabs (Files / Terminal / Run) are fixed

## Methodology (reminder)

Same rule as v0.0.1 : **every step runs Phase A (code reconnaissance)
then Phase B (plan)** before implementing, per the Methodology section
at the top of this doc. v0.0.2 has even more dependency on `libs/ui`'s
composed components (tabs container, diff viewer chrome, dropdown,
empty states) and on richer Tauri commands (PTY, FS watcher, IDE
detection) — Phase A is where mismatches between what `plan.md`
imagined and what's actually built come to the surface.

## Step order

```
1. Aside reshape         → the aside becomes a tabbed panel (empty tabs)
2. Files tree            → tree of the workspace repo, live updates
3. Diff view             → per-file diff against base branch, live updates
4. Terminal tab          → sandboxed terminal at the worktree path
5. Run tab               → execute the project's run command
6. Open in IDE           → dropdown in the workspace header
```

Steps 2 and 3 share infrastructure (a filesystem watcher and a git
status query), so consider shipping `2a/3a` (data plumbing) before
`2b/3b` (UI) rather than fully sequentially.

---

## Step 1 — Aside reshape

### User goal

> _"The right column of my workspace is no longer empty : I see tabs
> 'Files', 'Terminal', 'Run'. I can click between them. They're empty
> shells for now, but the structure is there."_

### Scope

- Refactor `shell/shell-aside.ts` to host a tabbed panel
- New `shell/aside-tabs.ts` : tab strip + tab content area
- Active tab reflected in a query param (`?tab=files|terminal|run`) so
  reloads preserve the tab
- Each tab content is a feature-level component, lazy-loaded
- New domain folder is created : `repositories/` (will own files + diff)
- Stub components added (empty, with `<!-- TODO -->` templates) :
  - `repositories/feature-file-tree.ts`
  - `workspaces/feature-terminal.ts`
  - `workspaces/feature-run.ts`

### UI primitives used (from `libs/ui`)

- `HlmTabs` — the tab strip + tab content area in the aside
- `HlmIcon` — per-tab icon (file / terminal / play)

### Tauri side

Nothing to wire.

### Sub-steps

1. **1a** — Plan mode : decide tab strip placement (top of aside vs
   side rail), copy, icons, active state styling
2. **1b** — Refactor aside into tabs container
3. **1c** — Query-param sync for active tab
4. **1d** — Stub components in their domains

### Definition of done

- [ ] Tabs visible at the top of the aside
- [ ] Click switches the active tab and updates `?tab=...`
- [ ] Reload preserves the active tab
- [ ] Each tab shows a placeholder ; no errors in console

---

## Step 2 — Files tree

### User goal

> _"In the Files tab, I see the tree of files in this workspace's repo.
> I can expand folders, click a file to select it. When the agent creates
> a new file, it appears within a second."_

### Scope

- New domain : `repositories/`
- `repositories/data/repository.adapter.ts` :
  - `listFiles(workspaceId): Promise<FileNode[]>` — tree of the worktree
  - `watchFiles(workspaceId): Observable<FileEvent>` — FS events
- `repositories/data/repository.store.ts` : per-workspace tree state
- `repositories/ui-file-tree-node.ts` : recursive tree node component
- `repositories/feature-file-tree.ts` : roots the tree in the aside
- `.gitignore`-aware filtering (ignored files hidden by default, with
  a "Show ignored" toggle)
- Selected file is held in store state (will be used by the diff view)

### UI primitives used (from `libs/ui`)

- `HlmScrollArea` — scrollable tree container
- `HlmIcon` — folder / file / per-extension icons
- `HlmBadge` — small "ignored" or "new" badge when relevant
- `HlmSkeleton` — placeholder while the tree loads
- `HlmEmpty` — empty state when the repo has no tracked files

For abstract behavior :

- `@angular/cdk/scrolling` — `cdkVirtualScroll` for very large trees

### Tauri side

- `fs_list_dir(path)` — probably exists already
- `fs_watch(path)` emitting `fs_event` events (or
  `tauri-plugin-fs-watch`)
- `git_check_ignore(repoPath, files)` to filter ignored entries
- All operations rooted at the worktree path ; the path itself is
  **never returned to the frontend** — only relative paths are exposed

### Sub-steps

1. **2a** — Plan mode : tree visuals, empty state, large-folder UX,
   loading state, selection feedback
2. **2b** — Adapter + initial load on workspace open
3. **2c** — UI rendering, expand/collapse, selection
4. **2d** — FS watcher integration with debounced updates (200 ms)
5. **2e** — `.gitignore` filtering + "Show ignored" toggle

### Rules

- The tree is rooted at the **worktree path**, but the path is never
  shown. Displayed paths are relative to the repo root.
- The tree is a `repositories/` concept, not a `workspaces/` one — even
  though it's scoped per workspace.
- The file tree is **never** the source of truth for content — it's a
  view over the filesystem. No caching of file content in the store.

### Definition of done

- [ ] The Files tab shows the workspace's file tree
- [ ] Expanding/collapsing folders works smoothly
- [ ] When the agent creates a file, it appears within ~1 s
- [ ] When the agent deletes a file, it disappears within ~1 s
- [ ] Files in `.gitignore` are hidden by default
- [ ] "Show ignored" toggle works and persists per workspace
- [ ] The word "worktree" appears nowhere in the rendered tree

---

## Step 3 — Diff view

### User goal

> _"I click a modified file in the tree, and I see exactly what changed
> against the base branch — added lines, removed lines. As the agent
> keeps editing, the diff updates live."_

### Scope

- `repositories/data/repository.adapter.ts` extended :
  - `diffStatus(workspaceId): Promise<DiffStatus[]>` — A/M/D per file
  - `diffFile(workspaceId, path): Promise<UnifiedDiff>`
- `repositories/ui-diff-viewer.ts` : renders unified diff (split mode is
  nice-to-have, can be skipped for v0.0.2)
- `repositories/feature-file-tree.ts` updated : changed files get an
  A/M/D badge
- Click on a changed file → diff opens (split layout : tree on top,
  diff below ; or modal — design call in plan mode)
- Live refresh : when files change (FS event), refresh diff status and
  the open diff

### UI primitives used (from `libs/ui`)

- `HlmBadge` — A / M / D status badges on tree nodes
  (variants : `default` / `secondary` / `destructive`)
- `HlmEmpty` — "No changes yet" empty state
- `HlmScrollArea` — diff content scrolling
- `HlmSeparator` — between hunks if a hunk-grouped layout is chosen

For abstract behavior :

- `@angular/cdk/scrolling` — virtual scroll for very large diffs
- `@angular/cdk/clipboard` — copy hunk button (nice-to-have)

### Tauri side

- `git_diff_status(repoPath, baseBranch)` — returns A/M/D per file
- `git_diff_file(repoPath, baseBranch, path)` — returns unified diff text
- The **base branch** is recorded on the Workspace at creation (default :
  the source repo's HEAD at the time of workspace creation)
- Update the `workspaces` table : add `base_branch TEXT` column

### Sub-steps

1. **3a** — Plan mode : layout (tree above diff vs side-by-side), copy
   for empty state ("No changes yet"), badge style
2. **3b** — `base_branch` column + facade method to read it
3. **3c** — Diff status + badges on the file tree
4. **3d** — Diff viewer for a single file (unified mode)
5. **3e** — Live update : on FS event, refresh status + open diff
6. **3f** — Empty state and error state (e.g. base branch missing)

### Rules

- Diffing is **always against the workspace's base branch**, recorded at
  creation. Never `HEAD`, never `main` literally.
- The word "HEAD" / "ref" / "commit" never appears in the UI ; use
  "base branch" and "current state".
- The diff is **read-only** in v0.0.2. No apply/revert hunks.

### Definition of done

- [ ] Changed files have an A/M/D badge in the tree
- [ ] Clicking a changed file shows its diff
- [ ] As the agent edits the file, the diff updates within ~1 s
- [ ] Empty state when no changes : friendly copy
- [ ] No "HEAD" / "refs/heads" leaks in the DOM

---

## Step 4 — Terminal tab

### User goal

> _"I open the Terminal tab. I'm dropped in a shell already rooted at
> this workspace. I run commands. The session stays alive if I navigate
> away and come back. Switching to another workspace gives me a separate
> terminal for that one."_

### Scope

- `workspaces/feature-terminal.ts` rendering an xterm.js terminal
- `workspaces/data/terminal.adapter.ts` :
  - `spawn(workspaceId): Promise<void>` — opens a PTY at the worktree path
  - `write(workspaceId, data: string): Promise<void>` — sends keystrokes
  - `onData(workspaceId): Observable<string>` — receives output
  - `resize(workspaceId, cols: number, rows: number): Promise<void>`
  - `kill(workspaceId): Promise<void>` — on workspace archive
- One PTY per workspace, **persisted across navigation** (closing the tab
  doesn't kill the shell)
- The terminal's title shows the workspace name, not the path
- The user's default shell is used (`$SHELL` env or platform default)

### UI primitives used (from `libs/ui`)

- The terminal itself is **xterm.js** (third-party canvas-based) — no
  Spartan wrapper needed
- `HlmButton` — small "Clear" / "New session" action in the header
- `HlmBadge` — exit-code indicator when a shell exits

For abstract behavior :

- `@angular/cdk/layout` — to react to aside resize and call xterm's
  `fit` addon

### Tauri side

- `pty_spawn(cwd, shell?)` returning a PTY id (= workspace id)
- `pty_write(id, data)`, `pty_resize(id, cols, rows)`, `pty_kill(id)`
- Events : `pty_data` (output), `pty_exit`
- Plugin candidates : `tauri-plugin-shell` or a custom PTY (portable-pty
  crate is a common choice on the Rust side)

### Sub-steps

1. **4a** — Plan mode : behavior on workspace archive, on shell exit
   (auto-restart? show "shell exited" message?), copy paste UX
2. **4b** — Terminal adapter + Tauri PTY commands
3. **4c** — xterm.js integration in the feature component
4. **4d** — Persistence : keep PTY alive when switching tabs/workspaces ;
   re-attach to existing PTY on re-render
5. **4e** — Resize handling (window resize, aside resize)
6. **4f** — Cleanup : kill PTY on workspace archive

### Rules

- The shell's `cwd` is the worktree path. This is the **only place** in
  the UI where the worktree path leaks (via the shell prompt itself).
  This is acceptable — the user controls their prompt. The `feature-terminal`
  component does NOT display the path on its own.
- "Sandboxed" here means the shell starts in the worktree directory. It
  is **not** a container or chroot ; the user can `cd` out.
- One PTY per workspace. Never share PTYs across workspaces.

### Definition of done

- [ ] Terminal opens at the worktree path (visible via `pwd`)
- [ ] Commands run, output streams correctly (colors, cursor, etc.)
- [ ] Switching tabs and coming back : same session, same scrollback
- [ ] Switching workspaces and coming back : same session for that
      workspace, no cross-contamination
- [ ] Archiving a workspace kills its PTY

---

## Step 5 — Run tab

### User goal

> _"In the Run tab, I configure a command (e.g. `npm run dev`). I click
> 'Run'. The command executes in the workspace and I see the output. I
> can stop it. If I navigate away while it's running, it keeps running."_

### Scope

- Per-project run command stored in the `projects` table :
  - new column `run_command TEXT`
- An inline editable field in the Run tab to set/edit the command
- `workspaces/feature-run.ts` :
  - Status indicator : `idle` / `running` / `exited(code)` / `crashed`
  - Output panel (reuses xterm in read-only mode, or a simpler log
    viewer — plan mode decides)
  - Run / Stop buttons
- `workspaces/data/run.adapter.ts` :
  - `start(workspaceId, command, cwd): Promise<void>`
  - `stop(workspaceId): Promise<void>`
  - `onOutput(workspaceId): Observable<string>`
  - `onExit(workspaceId): Observable<{ code: number }>`

### UI primitives used (from `libs/ui`)

- `HlmButton` — Run / Stop (variants : `default` / `destructive`)
- `HlmBadge` — status pill (`idle` / `running` / `exited(0)` / `crashed`)
- `HlmInput` — the run command field (inline edit)
- `HlmLabel` — label for the command field
- `HlmScrollArea` — output panel (or reuse xterm.js in read-only mode)
- `HlmEmpty` — empty state before the first run

### Tauri side

- Reuses PTY infrastructure from step 4 (a Run is a managed PTY with a
  preset command)
- `run_start(workspaceId, command, cwd)`, `run_stop(workspaceId)`
- The Run process is killed when the workspace is archived
- Events : `run_output`, `run_exit`

### Sub-steps

1. **5a** — Plan mode : status indicator design, what happens on crash,
   restart behavior, where to edit the command
2. **5b** — `run_command` column + facade for read/write
3. **5c** — UI to set the run command (inline edit in the Run tab)
4. **5d** — Start/stop flow with status indicator
5. **5e** — Output streaming + scroll-to-bottom behavior
6. **5f** — Persistence : keep the run alive when navigating away

### Rules

- The Run command runs **inside the worktree**, same `cwd` discipline as
  the terminal.
- Stopping is a hard kill (`SIGTERM` then `SIGKILL` after a 3 s grace).
- The Run tab does **not replace** the terminal — it's a managed shortcut
  for "the one command this project knows about".
- One run per workspace at a time. Starting again while running prompts
  to stop the current one first.

### Definition of done

- [ ] User can set a run command per project, persisted
- [ ] Click Run → output streams in the Run tab
- [ ] Click Stop → process exits within a few seconds
- [ ] Status indicator reflects reality (running / exited / crashed)
- [ ] Output preserved when navigating away and back
- [ ] Archiving a workspace stops the run

---

## Step 6 — Open in IDE

### User goal

> _"In the workspace header I see an 'Open in IDE ▾' dropdown listing
> the IDEs installed on my machine. I pick one, the workspace opens in
> that IDE on the current branch — and as the agent keeps editing, I
> see the changes live in the IDE."_

### Scope

- `workspaces/data/ide.adapter.ts` :
  - `detectInstalled(): Promise<IdeInfo[]>` — cached at app start, refresh
    on demand
  - `openWorkspace(workspaceId, ide: IdeInfo): Promise<void>`
- Initial detection list :
  - **VS Code** (`code` binary)
  - **Cursor** (`cursor` binary)
  - **Windsurf** (`windsurf` binary)
  - **Zed** (`zed` binary)
  - **JetBrains family** (via Toolbox or direct binaries : IntelliJ,
    WebStorm, PyCharm, RustRover, …)
  - **Sublime Text** (`subl` binary)
- `workspaces/ui-open-in-ide.ts` : dropdown component placed in the
  workspace header
- Last-used IDE remembered per user (`profile/data/profile.store.ts`),
  used as the dropdown's default selection
- Empty state : if no IDE is detected, the button is replaced by a small
  hint ("No supported IDE detected")

### UI primitives used (from `libs/ui`)

- `HlmDropdownMenu` — the IDE picker dropdown
- `HlmButton` — the trigger ("Open in IDE ▾")
- `HlmIcon` — per-IDE icon in the menu items
- `HlmTooltip` — hover hint on the trigger when no IDE is detected
- `HlmEmpty` (inline) — "No supported IDE detected" hint

### Tauri side

- `ide_detect()` : checks well-known install paths and `$PATH` for each
  supported IDE
  - **macOS** : `/Applications/Visual Studio Code.app`, `~/Applications/...`,
    `which code`, etc.
  - **Linux** : `which code`, `which cursor`, flatpak paths
  - **Windows** : registry keys + common install paths
- `ide_open(binaryPath, folderPath)` : spawns the IDE with the
  worktree path as argument

### Sub-steps

1. **6a** — Plan mode : dropdown placement, copy, icon per IDE, default
   selection behavior, empty state copy
2. **6b** — Detection logic in Tauri (start with VS Code / Cursor —
   easiest), wire adapter
3. **6c** — Dropdown UI with detected IDEs only
4. **6d** — Open command + error handling (IDE refused to launch, binary
   moved, …)
5. **6e** — Remember last-used IDE per user
6. **6f** — Expand detection to JetBrains family, Zed, Windsurf, Sublime

### Rules

- The dropdown shows **only detected IDEs**. No "Install VS Code" prompts.
- The path passed to the IDE is the **worktree path**. The IDE is
  effectively opened on the workspace's branch — edits the user makes in
  the IDE and edits the agent makes coexist in the same checkout.
- Conflict resolution between user edits and agent edits in v0.0.2 is
  first-write-wins (with the FS watcher reflecting both sides). Proper
  conflict UI is v1.0.0.

### Definition of done

- [ ] Detected IDEs appear in the dropdown with their icon
- [ ] Picking an IDE opens the worktree path in it
- [ ] Files edited externally in the IDE show up in Mozart's tree + diff
- [ ] Files edited by the agent show up in the open IDE within a second
- [ ] Last-used IDE is pre-selected next time
- [ ] No detected IDE → hint shown, no broken dropdown

---

## Recap : v0.0.2 demos

| Step | Demo at the end                                               |
| ---- | ------------------------------------------------------------- |
| 1    | "The right column is now a tabbed panel"                      |
| 2    | "I can browse the workspace's files inside Mozart"            |
| 3    | "I see exactly what the agent is changing, in real time"      |
| 4    | "I have a terminal inside Mozart, scoped to this workspace"   |
| 5    | "I can run my project's dev command from Mozart"              |
| 6    | **"I open the workspace in Cursor and watch the agent edit"** |

Step 6 is the v0.0.2 vision realized : Mozart isn't a chat — it's the
**control center** for an agentic session that the user can observe and
intervene in from any tool they want.

---

## Migration v0.0.1 → v0.0.2

The v0.0.1 structure is forward-compatible. The migration is additive
and roughly :

1. **Create `repositories/` domain** with `data/`, `feature-file-tree`,
   `ui-diff-viewer`, etc.
2. **Add `feature-terminal` and `feature-run`** under `workspaces/`
   (they belong to the workspace, not to a separate domain in v0.0.2 ;
   the existing v0.1.0 plan keeps them there).
3. **Refactor `shell/shell-aside.ts`** into a tabbed panel.
4. **Add columns to existing tables** :
   - `workspaces.base_branch TEXT`
   - `projects.run_command TEXT`
5. **Add `workspaces/data/ide.adapter.ts`** + the dropdown in the
   workspace header.

No file from v0.0.1 needs to move or be renamed. No URL changes. No data
migration beyond two ALTER TABLE statements.

---

## Anti-regression checks added in v0.0.2

On top of the v0.0.1 checks :

- **Worktree boundary holds** : `worktree.adapter.ts` is still the only
  file with explicit knowledge of `~/.mozart/worktrees/{id}/`. The
  terminal, run, and IDE adapters consult it for the path but never
  encode it themselves.
- **No leak of worktree path** in any displayed text (tree breadcrumbs,
  diff headers, run output prefixes, "Open in IDE" tooltip, …). The
  shell prompt inside the terminal is the only acceptable leak.
- **One PTY per workspace, one Run per workspace** : check via
  inspection that we never spawn duplicates.

---

_End of v0.0.1 + v0.0.2 plan._
