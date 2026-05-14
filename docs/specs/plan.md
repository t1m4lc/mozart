# Mozart — v0.0.1 MVP delivery plan

This document organizes v0.0.1 (the MVP being shipped to production)
into six prioritized **phases**. Everything described here is in
scope for v0.0.1. Items deferred beyond v0.0.1 are listed under
"Out of scope (post-MVP)" at the bottom.

Each phase is :

- **user-feature oriented** : something demoable lands at the end
- **additive** : no phase breaks the previous ones
- **faithful to the foundational conventions** below : `libs/ui`
  composition, adapter / DTO discipline, intra-domain architecture
- **respectful of existing code** : the codebase is partially built
  (UI shell, `libs/ui` composed components like `WorkspaceTabBar`
  and `ChatEmptyState`, a draft Claude adapter, a draft Timeline).
  The plan **cleans + completes** what's there ; it does **not**
  rebuild unless the existing code is broken and unfixable.

The six phases :

```
1. Project + Workspace flow       → add a project, auto-workspace, sidebar
2. Chat + Composer + Modes        → Agent/Plan/Ask, model/effort, send
3. Agent stream + Timeline        → Claude parser, raw text first, then UI
4. Git changes + Files + Terminal → right aside content (diff, term, IDE)
5. Auth + Foundations             → Clerk gate, /welcome, deep-link
6. Polish + Onboarding tour       → empty states, notifs, onboarding
```

Phases 1-4 build the value. Phase 5 gates it. Phase 6 polishes it.

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

## Cross-cutting tech conventions

These apply across every phase, not just the architecture layout.

### Forms — Angular Signal Forms

Every form in the app uses **Signal Forms**
(https://angular.dev/essentials/signal-forms), not the legacy
Reactive Forms / Template-driven Forms. Rationale : aligned with
the rest of the app's signal-based state (the foundational
conventions assume signal-based public surfaces), simpler typing,
no `FormGroup` ceremony.

Examples : the Clone GitHub repo form (URL + location), the
Create project form (name + parent + template), the Initialize
project dialog form (owner + repo name), the composer (input
text + mode + model + effort), the onboarding API-key entry.

### Icons — Lucide via `@ng-icons/lucide`

Use the wrapper already installed. Icon imports go via
`provideIcons({ lucideX })` on the components that render them.
Never inline SVG.

### Animations — `prefers-reduced-motion`

Every animation (shimmer, transitions, autoscroll, hover effects)
must respect `prefers-reduced-motion: reduce` and fall back to
static / instantaneous.

### Date formatting — `dayjs`

Relative dates in hover popovers, chat list timestamps, etc.
use `dayjs` (already wired). Format presets : `dayjs().fromNow()`
for relative ("2 min ago"), `dayjs().format('MMM D, HH:mm')` for
absolute.

---

# v0.0.1 MVP — Six phases

The phases below are the actual delivery plan. They share a common
methodology (Phase A code reconnaissance → Phase B plan → implement,
see "Methodology" above) and rely on the three foundational
conventions. Each phase ends with a demoable milestone.

> **Respect-the-existing rule.** A non-trivial codebase already
> exists : `libs/ui` has shipped composed dumb components
> (`WorkspaceTabBar`, `ChatEmptyState`, a draft Composer, a draft
> Timeline), the new Angular app is partially wired, the Tauri side
> has a Claude adapter draft, and `legacy/` holds prior code. Every
> phase's Phase A must :
>
> 1. Inventory what already exists for that phase's scope
> 2. Preserve what works (don't rebuild unless explicitly authorized)
> 3. Surface what's broken or visually inconsistent (especially in
>    the Composer + Timeline area — known broken in current code)
> 4. Propose targeted cleanups + additions, not wholesale rewrites

---

## Phase 1 — Project + Workspace flow

### User goal

> _"I open Mozart. The dashboard shows three large action cards :
> Open project, Open GitHub project, Quick start. I pick one,
> follow a short flow, and I land in a workspace **already created
> for me**, ready to chat. In the sidebar I see my project with the
> workspace nested under it."_

### Scope

**Dashboard `/`** (rendered when no workspace is selected) :

Three large clickable cards in a single horizontal row, in the
middle column. The left sidebar is visible ; the right aside is
hidden.

1. **Open project** — opens the system file browser. User picks a
   local folder. Project added.
2. **Open GitHub project** — opens a dialog `Clone GitHub repo`
   with two inputs (Spartan grouped input pattern) :
   - Repository URL
   - Location (default `/Users/{name}/mozart/repos`) + `Browse`
     button to change it
   - `Clone repo` button, Enter shortcut to submit
3. **Quick start** — opens a dialog `Create a project` with
   subtitle _"Create a local folder, private GitHub repo, and first
   workspace"_ :
   - Project name (text input)
   - Parent folder (text input + `Browse` button)
   - Template (radio cards) :
     - `Empty` — creates a new folder with a styled `README.md`
       (project title + brief blurb) and a sensible `.gitignore`
       (Node-default for v0.0.1 — detection of stack post-MVP)
     - `gstack` (SOON, disabled in MVP) — clones
       https://github.com/garrytan/gstack as the starter, which
       includes a curated set of skills. Full integration with
       the skills system is post-MVP (skills shortcuts are
       post-MVP, see bottom of doc).
   - `Create` button

**Add-project flow (all 3 cards converge to the same outcome)** :

1. Validate the folder.
2. If the folder is **not a git repo** : open the _"Initialize
   project"_ dialog (see §1a below) ; abort or proceed.
3. Insert the project row in the DB. If the folder is already a
   project (`path UNIQUE` constraint), do not insert ; show a toast
   _"This folder is already in your projects"_ and navigate to the
   existing project's auto workspace.
4. **Auto-create the first workspace** for that project :
   - Generate a unique name `{artist}-{N}` (musician name + numeric
     suffix, no zero-padding — e.g. `bob-marley-1`, `radiohead-2`).
     Names are picked from a curated list, with collision avoidance
     against existing workspaces.
   - Base branch = the source repo's currently-checked-out branch
     (`HEAD` at the moment of project add).
   - Branch name : `{github-username}/{workspace-name}` if GitHub
     is connected, else `mozart/{workspace-name}`.
   - Create the git worktree under
     `~/.mozart/worktrees/{workspace-id}/` (see Convention #2,
     `worktree.adapter.ts` is the sole file that knows the path).
   - **Project initialization** : if the project root contains a
     `package.json`, run `npm install` (or the detected package
     manager — pnpm if `pnpm-lock.yaml`, yarn if `yarn.lock`).
     Other ecosystems (cargo, pip, …) are generalized post-MVP.
   - Create the first chat for this workspace, named `"Start"`
     (default chat name across the app — replaces "Untitled").
5. Navigate to `/workspaces/:id` with the composer focused, ready
   to type.

**§1a — _"Initialize project"_ dialog** (non-git folder) :

Title : _"This folder isn't a git repository. Initialize it?"_

Explanation paragraph : _"Mozart will run `git init` to create a
repository in this folder. If you're connected to GitHub, Mozart
can also create a private GitHub repo, add it as origin, and push
to the main branch."_

Inputs (only visible if GitHub is connected) :

- **Owner** — default to the connected GitHub username, dropdown
  if the user has multiple orgs/owners available
- **Repository name** — default to the folder name (basename)
- Inline info under the inputs : _"will create {owner}/{repo-name}"_
  with a check icon if the name is available on GitHub, a warning
  if it's taken

Buttons : `Cancel` / `Initialize the project` (primary).

Action on submit :

- Run `git init` in the folder
- Run `git add . && git commit -m "Initial commit via Mozart"`
- If GitHub connected : create the private repo, add as `origin`,
  push to `main`
- Then proceed with the normal add-project flow above

**Sidebar (left column)** :

```
[macOS window controls]
─────────────────────────────────────
[back] [forward] [history] [search ← post-MVP deferred]
─────────────────────────────────────
Projects                  [+ Add a project]
  ▾ project-alpha
      ◦ bob-marley-1     (active)
      ◦ radiohead-2
  ▸ project-beta
─────────────────────────────────────
[Help]                   [⚙ Settings]
```

> **Out of MVP scope** : a separate **Chats group** in the
> sidebar (listing all chats chronologically across workspaces,
> including non-contextualized "Ask" chats) is deferred post-MVP.
> See "Out of scope (post-MVP)" for the full deferred spec.

Rules :

- Click on a project's name = **toggle expand/collapse**. Verify
  in Phase A that the existing context menus + buttons are wired
  behind their UI (UI may exist without behavior).
- Workspace row = `[icon branch | workspace-name]`. While the chat
  is streaming, the branch icon is replaced by a **cli loader**
  (subtle pulsing dots or spinner). If the chat has generated a
  title from the first prompt, **show the chat title instead of
  the workspace name** (better reflects user intent). The
  generated chat title is **persisted in the DB** (used in the
  breadcrumb too).
- **Bold the row if the workspace has unread messages** (any of
  its chats has `last_read_message_id < latest_message_id`).
- **Hover popover** on a workspace row : shows workspace name +
  status indicator + chat title + last LLM response (one line,
  truncated) + relative date (`dayjs` — _"just now"_, _"2 min
  ago"_).
- The `+ Add a project` button next to the _Projects_ group title
  opens the dashboard's three cards as a dialog (or routes back
  to `/` if the dashboard is the right answer — Phase B picks).
- **Right-click on the _Projects_ group title** opens a context
  menu with : `Expand all`, `Collapse all`, `Create project`,
  `Filters` (the last one is a future affordance — can ship as a
  no-op item or be omitted in MVP).
- **Right-click on a project row** opens the existing project
  context menu (rename / remove / open in finder / open in IDE /
  add workspace — preserve what exists today, audit confirms).
- **Right-click on a workspace row** opens the workspace context
  menu : `Mark as read`, `Pin`, `Set status` (sub-menu :
  idle / running / changed / failed — manual override),
  `Rename`, `Archive`.

**State coherence — no workspace selected** :

When the URL is `/` (dashboard) or any non-workspace page :

| Element                                         | Visible ?                           |
| ----------------------------------------------- | ----------------------------------- |
| Left sidebar                                    | ✅ always                           |
| Settings gear (sidebar bottom)                  | ✅ always                           |
| Help (sidebar bottom)                           | ✅ always                           |
| Middle column dashboard cards                   | ✅ when `/`                         |
| Breadcrumb                                      | ❌ hidden                           |
| Workspace tab bar                               | ❌ hidden                           |
| Composer                                        | ❌ hidden                           |
| Header buttons (`target branch`, `Open in IDE`) | ❌ hidden                           |
| Right aside                                     | ❌ hidden entirely (not just empty) |

The middle/right chrome is **conditional on workspace selection**,
not just empty when absent.

### Architectural placement

**Existing domains to keep / extend** : `projects/`, `workspaces/`,
`tasks/` (data-only, anticipates v1.0.0 multi-workspace tasks).

**New schema / migrations needed** :

```sql
-- Projects (already exists, verify) :
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  github_owner TEXT,
  github_repo TEXT,
  added_at INTEGER NOT NULL
);

-- Tasks (already exists per plan, verify) — 1:1 with Workspace in v0.0.1
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT,
  created_at INTEGER NOT NULL
);

-- Workspaces :
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL REFERENCES tasks(id),
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,         -- HEAD of source repo at creation
  status TEXT NOT NULL DEFAULT 'idle',
  worktree_path TEXT NOT NULL,       -- INTERNAL, never exposed to UI
  created_at INTEGER NOT NULL
);
```

### Foundational invariants

- **Convention #3** : the `projects/`, `workspaces/`, `tasks/`
  domains follow the facade pattern. Features inject facades,
  never stores or adapter tokens directly.
- **Convention #2** : every IO (file picker, git init, git
  worktree, GitHub API, npm install) goes through a domain's
  adapter, with DTOs derived from the actual Tauri / Rust command
  shape, not invented in TS.
- **Worktree path discipline** : `~/.mozart/worktrees/{id}/` only
  in `worktree.adapter.ts`.
- **Vocabulary** : `workspace`, `branch` (badge), never _worktree_
  / _HEAD_ / _refs/heads_ in user-facing strings.

### Demoable milestone

End of Phase 1, the user can :

1. See the dashboard with 3 cards on first launch
2. Click any card and follow the flow to add a project
3. Be auto-navigated to a freshly created workspace with a real
   name (e.g. `bob-marley-1`) and a first chat named `"Start"`
4. See their project + workspace in the sidebar with proper hover
   popover
5. Switch between workspaces by clicking in the sidebar
6. Have the middle / right chrome appear / disappear correctly
   based on whether a workspace is selected

What's **not** in Phase 1 : actual chat ability (that's Phase 2),
streaming agent (Phase 3), file changes / terminal (Phase 4),
auth gate (Phase 5).

---

## Phase 2 — Chat + Composer + Modes

### User goal

> _"In a workspace, I type a message in the composer, I pick a
> mode (Agent / Plan / Ask), I send. My message appears. I can
> switch between chats in the tab bar (the workspace can have up
> to 4 chat tabs)."_

**Phase 2 does not include LLM streaming** — that's Phase 3.
Messages send, persist, and render. The agent doesn't reply yet
(or replies with a stub).

### Scope

**Composer surface** (extends `libs/ui` `Composer` from prior
work) :

- **Mode segmented control** : 3 options `Agent | Plan | Ask`,
  always visible. Mode is **changeable before every message**
  (not locked after first send).
- **Visual treatment per mode** :
  - Agent (default in workspace) : neutral
  - Plan : accent-tinted border + accent placeholder
  - Ask : muted border + `Read-only` label top-left of textarea +
    placeholder _"Ask anything — read-only mode, no file edits"_
- **Model select** (`HlmSelect` styled with the dropdown content
  pattern : groups by provider, model rows with provider icon +
  name + optional `New` badge + check on selected). Tooltip
  _"Change model"_.
- **Effort select** (`HlmSelect` with graduation icons that scale
  with the level). Five options : `low | medium | high | xhigh |
max`. Tooltip _"Adjust effort"_.
- **Send button** (bottom-right). Disabled if textarea is empty
  or `disabled` input is true.

> **Out of MVP scope** : `/` skills and `@` context shortcuts
> (with their chip-based attachment surface). These are deferred
> post-MVP. The Composer in v0.0.1 is just textarea + mode +
> model + effort + send. See "Out of scope (post-MVP)" at the
> bottom of this doc for the full deferred spec.

**Two absolute-positioned buttons on the composer** :

- **Top-left `scroll-to-bottom` button** — visible only when the
  user has scrolled up from the bottom. Click → smooth scroll to
  the anchor below the latest message.
- **Top-right `next unread workspace` button** — visible only if
  there exists another workspace in the same project with
  `unread > 0`. Click → navigate to that workspace's most recent
  unread chat.

**Tab bar (existing `WorkspaceTabBar` from `libs/ui`)** :

- Already implements : up to 4 chat tabs, rename via pen icon,
  close button, _New chat_ button at far right.
- Phase 2 wires it up : `feature-chat-tab-bar` smart wrapper
  connects it to the chat facade.
- **Addition** : while a chat is streaming, the chat's tab shows
  a **cli loader in place of the LLM icon**.
- **Tab title** : when the chat has a generated title (from
  Phase 3), it's shown ; otherwise the first chat is always named
  `"Start"`, others fall back to `"Untitled"`.

**Chat modes — state model** :

- `chats.mode: 'agent' | 'plan' | 'ask'` (NEW column, **migration
  required**).
- All v0.0.1 MVP chats are bound to a workspace (no standalone
  chats — see post-MVP scope below). Default mode = `agent`.
- The user may switch any chat to `plan` or `ask` at any time
  via the segmented control, including between messages — mode
  is not locked after first send.
- Mode is **sticky per chat** (persisted in DB).

> **Out of MVP scope** : non-contextualized chats opened from a
> sidebar Chats group (chats not bound to any workspace). The
> Chats group + the system workspace pattern for these chats is
> deferred post-MVP. See "Out of scope (post-MVP)" for the
> deferred spec.

**Providers — config, not DB** :

LLM providers and their models are stored in **app code config**
(e.g. `providers.config.ts`), not in the local DB. Rationale :
the local DB is user-writable and shouldn't carry app-critical
config that could be tampered with.

### Architectural placement

**Existing domain to extend** : `chat/`.
**New / extended files** :

- `chat/data/chat.model.ts` — add `mode`, `last_read_message_id`,
  `title` (generated)
- `chat/data/chat.facade.ts` — `sendMessage(text, mode)`
- `chat/feature-composer/` — smart wrapper around
  `libs/ui` `Composer`
- `chat/feature-chat-tab-bar/` — smart wrapper around
  `WorkspaceTabBar`

### Database migrations summary

```sql
-- v0.0.1 Phase 2 migration script

ALTER TABLE chats ADD COLUMN mode TEXT NOT NULL DEFAULT 'agent';
ALTER TABLE chats ADD COLUMN title TEXT;                     -- generated
ALTER TABLE chats ADD COLUMN last_read_message_id TEXT;      -- for unread
```

> No system workspace, no `skills` table, no `attached_skills` /
> `attached_contexts` columns in v0.0.1 MVP. Those land post-MVP
> with the chats group + shortcuts features.

### Foundational invariants

- **Convention #1** : composer + tab bar visuals come from
  `libs/ui` ; smart wrappers stay thin.
- **Convention #2** : the chat `sendMessage` payload (text + mode
  - chatId) has a DTO matching the Tauri command shape.
- **Convention #3** : `chat/` follows the facade pattern.

### Demoable milestone

End of Phase 2, the user can :

1. Type a message with mode selection, send it, see it persist
2. Switch chats in the tab bar (up to 4 per workspace)
3. Switch between Agent / Plan / Ask modes via the segmented
   control — see the visual treatments change
4. See the absolute-positioned composer buttons appear when
   relevant (scroll-to-bottom when scrolled up ; next-unread when
   another workspace in the same project has unread)
5. Notice the Ask mode visual treatment (muted border, read-only
   label)

What's **not** in Phase 2 : the LLM actually responding (Phase 3) ; sidebar Chats group + standalone non-contextualized chats
(post-MVP) ; skills + context shortcuts (post-MVP).

---

## Phase 3 — Agent stream + Timeline + Parser

### User goal

> _"I send a message. The agent streams a response back. For now,
> it's just the raw text rendered cleanly with a proper anchor /
> viewmodel scroll pattern. The agent simultaneously edits files
> in the workspace's worktree on disk. If I open the workspace in
> my IDE on the right branch, I see edits land live."_

### Critical context — Phase 3 has two sub-phases

**Phase 3a — Make it work, raw and clean** (priority) :

The existing Timeline implementation has visual issues (collapse
arrows misaligned, ugly styling) and the scroll handling is a
**broken patch**. Phase 3a does the following :

1. **Remove the broken Timeline UI components** for now (keep the
   parser + reducer, those are pure and reusable).
2. **Render assistant messages as raw text only** — clean
   paragraph rendering, no structured timeline, no collapse, no
   shimmer (for now).
3. **Implement a proper scroll pattern** :
   - An **anchor element** placed **after** the latest message
     (always at the bottom of the conversation).
   - A `viewmodel()` signal exposing the anchor's visibility +
     scroll position to the smart wrapper.
   - **Sticky-bottom behavior** : if the user was already at the
     bottom (anchor visible) when new content arrives, auto-scroll
     to keep the anchor visible ; if the user has scrolled up,
     don't auto-scroll.
   - The composer's `scroll-to-bottom` button (Phase 2) appears
     when the anchor is not visible.
   - Remove all the existing ad-hoc scroll patches.
4. **Keep the parser + reducer working** — they live in
   `domains/llm-model/data/stream/` as pure functions. They
   normalize Claude's stream into `StreamEvent` and accumulate a
   `TurnState`. Phase 3a renders just the `TurnState.text`
   accumulation, ignoring tool calls / thinking / status for now.
5. **Notification + sound when the agent finishes** a turn and
   the user isn't on the chat's workspace.

**Phase 3b — UI Claude-inspired Timeline** (after 3a is stable) :

Done as a **dedicated UI pass with reference screenshots /
specifications of Claude.ai**. Brings back :

- Collapsible turn header with shimmer summary
- Vertical timeline of items (file read / edit / create / shell
  / search / thinking / generic)
- File chips + diff stats
- Plan mode UI (`plan_proposal` → PENDING items → Approve /
  Cancel)
- Done marker, error marker

Phase 3b reuses the parser + reducer from 3a unchanged ; it only
adds renderers in `libs/ui/timeline/` and a smart `feature-
agent-message` wrapper. See `llm-stream-parser.md` and
`composer-timeline-ui.md` for the full spec — note that those
docs describe the **3b end state**, not the 3a starting point.

### Why two sub-phases

The user has explicitly flagged the existing UI as broken and
wants a clean baseline first. 3a unblocks the rest of the
product (agent edits work, scroll works) ; 3b is purely UI
polish done with proper visual specs in hand.

### Scope — Phase 3a

**Parser + reducer** (`domains/llm-model/data/stream/`) :

- Keep / clean : `event.types.ts`, `anthropic.parser.ts`,
  `reducer.ts`, fixtures
- Pure functions only — no Angular, no Tauri, no DOM
- Unit-tested against fixtures (text-only, multi-tool, error,
  truncation, plan-proposal — even if the last 3 are unused in
  3a, keep the parser ready for 3b)

**Tauri adapter** (`domains/llm-model/data/tauri-claude.adapter.ts`) :

- Subscribes to the Tauri agent command events
- Feeds them into `anthropic.parser`
- Exposes `stream(messages): AsyncIterable<StreamEvent>` to the
  chat domain
- **The only file in the app** that imports `@tauri-apps/api`
  for the LLM concern

**Chat-side wiring** (`domains/chat/`) :

- `chat.facade.sendMessage` orchestrates :
  1. Persist user message (text + mode, no attachments in MVP)
  2. Create assistant message in `status: 'streaming'`, empty
     `turn_state`
  3. Subscribe to `llmAdapter.stream(...)`, push each event
     through the reducer, update the message's `turn_state`
     signal
  4. On `message_end`, set `status: 'done'` ; on error, set
     `status: 'error'`
- `feature-agent-message` (raw renderer for 3a) : just renders
  `turn_state.text` in a clean paragraph. No tool call display
  yet.

**Scroll pattern** :

- `feature-chat-area` owns the scroll container.
- An anchor `<div #bottomAnchor></div>` is rendered after the
  last message.
- An `IntersectionObserver` watches the anchor's visibility ;
  exposes a signal `isAtBottom: Signal<boolean>`.
- When `isAtBottom()` is true AND new content arrives, smooth-
  scroll to the anchor.
- When `isAtBottom()` is false, the composer's
  `scroll-to-bottom` button is visible.
- No ad-hoc scroll-into-view calls scattered through the chat
  code ; all scroll concerns live in the chat-area's smart
  component and are derived from the anchor signal.

**Notifications** :

- On `message_end`, if the user is not on the chat's workspace,
  emit a desktop notification with the workspace name + first
  line of the assistant message.
- Play a subtle sound (configurable in settings ; default ON).
- Mark the chat as having unread (`messages.created_at` >
  `chats.last_read_message_id`).

### Scope — Phase 3b (separate task, done after 3a)

Defer the full spec to a dedicated prompt that bundles :

- Claude.ai reference screenshots / specifications
- The `libs/ui/timeline/` renderer family
- The `feature-agent-message` upgrade to mount the Timeline
- Reduced-motion handling
- Plan mode UI (Approve / Cancel)

See `llm-stream-parser.md` §4-§6 and §7 for the target visuals
and behavior — but **Phase 3b refines those specs** against
actual Claude.ai screenshots before implementing.

### Architectural placement

- Parser + reducer + types : `domains/llm-model/data/stream/`
  (pure)
- Tauri adapter : `domains/llm-model/data/tauri-claude.adapter.ts`
- Chat wiring : `domains/chat/feature-agent-message/`
- Scroll concern : owned by `domains/chat/feature-chat-area/`
- Renderers (Phase 3b only) : `libs/ui/timeline/`

### Foundational invariants

- **Parser purity** : `grep -rn '@angular\|@tauri-apps\|window\|document'
domains/llm-model/data/stream/` returns zero matches.
- **Reducer purity** : `(state, event) => state`, no side
  effects.
- **Adapter discipline** (Convention #2) : Tauri import only in
  the adapter file.
- **Timeline append-only** during a turn (Phase 3b).

### Demoable milestone

End of Phase 3a :

1. Send a message → agent streams back, text appears progressively
2. Send "create a hello.txt in this project" → file appears on
   disk in the worktree ; visible via `ls` or in an external IDE
   opened on the workspace's branch
3. Scroll up while streaming → auto-scroll stops, button appears
4. Click `scroll-to-bottom` → smooth scroll back, button hides
5. Receive a message while on another workspace → notification +
   sound, badge in the sidebar

End of Phase 3b : the cinematic Claude-style timeline.

What's **not** in Phase 3 : file tree / diff / terminal (Phase
4).

---

## Phase 4 — Git changes + Files + Terminal + IDE

### User goal

> _"In the workspace's right aside I see the file tree of the
> workspace, with badges showing which files the agent (or I)
> changed. Clicking a changed file shows its diff against the
> base branch. I have a terminal scoped to this workspace, and a
> Run tab to execute the project's dev command. I have an Open
> in IDE button to jump to my editor on the right branch."_

### Scope

This phase folds the work previously documented as "v0.0.2" into
the v0.0.1 MVP. Six sub-deliverables :

**4a — Right aside tabs structure** :

- Tabbed panel (`HlmTabs`) with `Files`, `Terminal`, `Run`
- Active tab persisted in URL query param `?tab=...`
- Header above the tabs : branch badge, `Open in IDE` dropdown,
  `Commit` button (placeholder text, opens commit dialog in 4f)
- Aside visible **only when a workspace is selected** (Phase 1
  rule still applies)
- Width : fixed 320px for v0.0.1 MVP. Resizable post-MVP.

**4b — Files tree (Files tab)** :

- Domain : `repositories/` (new)
- Tree rooted at the worktree path (path itself never exposed in
  UI — only relative paths visible)
- Live FS watcher with debounced (200 ms) updates
- `.gitignore`-aware filtering with a "Show ignored" toggle
- Per-file badges : `A` (added) / `M` (modified) / `D` (deleted)
  against the base branch
- Click a file → open diff in a side panel (4c)
- Phase A inventories whether `tauri-plugin-fs-watch` (or
  equivalent) is already wired

**4c — Diff view** :

- Read-only unified diff against the workspace's `base_branch`
  (captured at workspace creation, Phase 1)
- Live refresh on FS events
- Empty state when no changes : _"No changes yet."_
- UI never shows `HEAD` / `refs/heads/...` — only "base branch"
  and "current state"

**4d — Terminal tab** :

- xterm.js terminal rooted at the worktree path
- One PTY per workspace, persisted across navigation (don't kill
  the PTY when switching tabs / workspaces)
- Killed on workspace archive
- The shell prompt may display the path (user-controlled) ;
  Mozart itself never displays the path

**4e — Run tab** :

- Per-project run command stored in `projects.run_command`
- Status indicator : `idle` / `running` / `exited(code)` /
  `crashed`
- `Run` / `Stop` buttons (`HlmButton` ; Stop is `destructive`
  variant)
- Output via xterm.js read-only
- One run per workspace at a time

**4f — Open in IDE + Commit + Push** :

- **Open in IDE dropdown** in the aside header :
  - Detected IDEs only (VS Code, Cursor, Windsurf, JetBrains
    family, Zed, Sublime). Detection cached at boot, refreshable.
  - Click → opens the worktree path in the selected IDE
  - Last-used IDE remembered per user
- **Commit dialog** :
  - Lists changed files with checkboxes (all checked by default)
  - Commit message input
  - `Commit` button → runs `git commit` in the worktree
- **Push to PR** (the MVP-critical bit) :
  - Button `Create PR` (visible when there's at least one commit
    on the workspace branch ahead of base)
  - Opens a dialog : title (defaulted to commit subject), body
    (defaulted to commit body), checkbox `Draft PR`
  - Submits via the GitHub adapter (needs GitHub connected ;
    if not, prompts user to connect — just-in-time per Phase 5)
  - On success, the PR URL is shown ; a toast offers to open it

### Architectural placement

**New domain** : `repositories/` (file tree, diff, git ops).

**Existing domain to extend** : `workspaces/` (terminal, run, IDE
under here since they're per-workspace).

**New schema** :

```sql
ALTER TABLE workspaces ADD COLUMN base_branch TEXT NOT NULL DEFAULT 'main';
ALTER TABLE projects ADD COLUMN run_command TEXT;

-- Per-user IDE preference :
CREATE TABLE user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Foundational invariants

- All Tauri commands for FS / git / PTY / IDE detection through
  domain adapters (Convention #2).
- File tree never displays the worktree path ; relative paths
  only.
- Vocabulary holds throughout : "base branch", "current state",
  never `HEAD` / `refs/heads`.

### Demoable milestone

End of Phase 4, the user can :

1. Send a message → agent edits files → file tree updates live
   with `M` badges
2. Click a modified file → see its diff
3. Open the terminal tab → run arbitrary commands in the
   workspace
4. Configure a run command for the project → click `Run` → see
   `npm run dev` output
5. Click `Open in IDE` → opens VS Code (or whichever) on the
   workspace's branch
6. Click `Commit` → fills a message → commits the changes
7. Click `Create PR` → opens a dialog → submits the PR to
   GitHub → gets the PR URL

This is the **MVP-critical demo** : end-to-end from prompt to
PR.

What's **not** in Phase 4 : merge UI (post-MVP), conflict
resolution (post-MVP), PR review inside Mozart (post-MVP).

---

## Phase 5 — Auth + Foundations

### User goal

> _"When I open Mozart for the first time, I'm asked to sign in.
> I click 'Sign in', the browser opens `app.mozart.build`, I auth
> via GitHub or Google through Clerk, the web app deep-links me
> back into the desktop app. I'm in."_

### Scope

**Why Phase 5, not Phase 1** : auth is a gate around value. The
value (phases 1-4) is built first, in dev mode without auth ;
Phase 5 wraps it. This lets us dev fast without Clerk friction
and ship the gate as one focused phase.

**Desktop app** :

- New route `/welcome` — the only route accessible without a
  valid auth token. Centered Mozart logo + tagline + button
  _"Sign in to continue"_.
- Click _"Sign in"_ → opens default browser at
  `https://app.mozart.build/`. The button label switches to
  _"Opening browser…"_ with a sub-line _"Finish sign in in the
  browser window"_.
- Listens for the deep-link callback `mozart://auth?token=...`.
- On callback : validate the token, store it (system keyring),
  redirect to `/` (dashboard) if `user.onboarding === true`,
  else to `/onboarding` (Phase 6).

**Offline + token** : if the user has a valid stored token and
is offline, the app starts normally (no Clerk roundtrip), as
long as at least one LLM provider is local (e.g. a local model).
Phase A confirms how token validity is checked offline.

**`apps/web`** (Nx web app, may already exist — Phase A
verifies) :

- `/login` — centered Mozart logo + title _"Start composing"_ +
  two buttons _"Connect with GitHub"_ / _"Connect with Google"_
  (Clerk-managed providers).
- `/dashboard` — visible after auth. Greeting _"Happy to see you
  again, {name}"_ + a primary button _"Launch Mozart desktop"_
  that triggers `mozart://auth?token=...` in the user's browser.
- All other routes irrelevant for v0.0.1 MVP — keep `apps/web`
  minimal.

**Architectural placement** :

- New domain : `auth/` in the desktop app, owns the token state
  - adapter to the Clerk callback handler on the Rust side.
- Tauri side : deep-link handler (`mozart://auth`) — Phase A
  inventories whether this is wired.
- `apps/web` follows its own structure (Next.js / Angular —
  Phase A confirms what's in the repo).

### Foundational invariants

- The token is stored in the **system keyring** (macOS Keychain
  / Windows Credential Manager / Linux secret-service) — never
  plaintext, never in the local SQLite DB.
- The auth adapter is the only file that talks to the Clerk
  callback.
- The token's presence + validity is checked at app boot ; the
  routing layer reads from `AuthFacade.isAuthenticated`.

### Demoable milestone

End of Phase 5 :

1. First launch → `/welcome` only ; everything else inaccessible
2. Click _"Sign in"_ → browser opens `apps/web` `/login`
3. Auth via GitHub or Google in Clerk
4. `/dashboard` shows the greeting + _"Launch Mozart desktop"_
   button
5. Click the launch button → deep-link fires → desktop app
   transitions from `/welcome` to `/` (or `/onboarding` if new
   user)
6. Restart the app while authenticated → goes straight to `/`
   without re-auth
7. Restart while offline (with valid token) → still works, uses
   local LLM provider if available

What's **not** in Phase 5 : the onboarding flow itself (Phase
6).

---

## Phase 6 — Polish + Onboarding tour

### User goal

> _"After signing in for the first time, Mozart walks me through
> a friendly setup : it checks that Git is installed, asks me to
> set up at least one LLM provider, optionally connects me to
> GitHub. Then it gives me a quick tour. Throughout the app,
> every empty state and error state is intentional and clear."_

### Scope

**Onboarding flow** (route `/onboarding`, accessible only after
auth, only if `user.onboarding === false`) :

Steps, in order :

1. **Welcome message** — _"Let's set up Mozart in 4 quick
   steps"_. Skippable tour at the end.
2. **Git check (required)** :
   - Detect via `git --version` in PATH.
   - If missing : show OS-specific install instructions with
     copy-paste commands (`brew install git` on macOS, `apt
install git` on Debian, MSI installer link on Windows).
   - `Verify` button re-runs the check.
3. **LLM provider setup (required, at least one)** :
   - List of supported providers (from the config, not DB) with
     status pills (`Not configured` / `Configured` / `Connected`).
   - Claude Code is the only fully implemented one for v0.0.1
     MVP : the user runs `claude login` or pastes an API key as
     a fallback.
   - Other providers (OpenAI, OpenRouter, local) listed as
     _"Coming soon"_ — disabled.
   - `Continue` button enabled once at least one provider is
     configured.
4. **GitHub connection (optional)** :
   - Button _"Connect GitHub"_ triggers a Clerk OAuth flow for
     GitHub.
   - Skippable. Without GitHub : PR creation in Phase 4 is
     gated (button shows _"Connect GitHub to create PRs"_).
5. **Feature tour (skippable)** — route `/tour` :
   - 4-5 brief slides : the dashboard, the sidebar, the chat
     composer, the file tree + diff, the terminal + IDE
     handoff.
   - `Skip` button always visible.
   - `Finish` on the last slide → sets `user.onboarding = true`
     and redirects to `/`.

**Polish — empty states and error states** :

Phase A of Phase 6 inventories every surface and confirms each
has a deliberate state. Non-exhaustive list :

- Sidebar with no projects → _"Add a project to get started"_
- Workspace area with no workspace selected → dashboard cards
  (covered in Phase 1)
- Chat area with no messages → `ChatEmptyState` from `libs/ui`
  (covered in Phase 2)
- Files tab with no changes → _"No changes yet"_ (Phase 4)
- Terminal not yet opened → terminal auto-starts on tab open
- Run tab with no run command configured → inline editor to set
  one
- Stream error mid-turn → error marker in the message + retry
  button
- Git init failure → toast with the git error
- Agent crash → toast + the assistant message flips to error
- Network down (auth-gated paths) → graceful offline banner +
  retry button
- Worktree creation failure → rollback (Phase 1 atomicity rule)
  - toast
- App close mid-stream → on restart, the last `streaming`
  message flips to `error` with _"Interrupted"_ badge

**Polish — notifications** :

- Per Phase 3a : `message_end` on a non-focused chat → desktop
  notification + sound.
- User preferences in settings : toggle sound, toggle desktop
  notifications, choose sound (default subtle bell).

**Polish — known broken composer / chat issues** (per user
feedback) :

Phase A confirms / catalogs ; Phase B prioritizes fixes :

- Composer focus lost after send
- Scroll behavior inconsistent (resolved structurally by Phase
  3a's anchor + viewmodel pattern)
- Visual misalignment of collapse arrows in the existing
  Timeline (resolved by Phase 3a removing the broken Timeline,
  Phase 3b rebuilding it cleanly)

### Architectural placement

- New domain : `onboarding/` — feature components for each step,
  facade owning `user.onboarding` and provider-detection state.
- Existing domain `profile/` extended : keyring access for
  provider keys, IDE preference, sound preference.

### Foundational invariants

- Onboarding is **gated by auth** (Phase 5 token required).
- Each step has explicit `Skip` / `Continue` / `Verify`
  affordances.
- The `/tour` slides are dumb components in `libs/ui` (one
  composed component per slide if reused, otherwise inline in
  the feature).

### Demoable milestone

End of Phase 6, a brand-new user :

1. Lands on `/welcome` → signs in → comes back to `/onboarding`
2. Walks through the 4 steps in <2 minutes
3. Skips or completes the tour
4. Arrives at `/` ready to add a project
5. Encounters intentional empty states everywhere
6. Gets a desktop notification + sound when the agent finishes
   a turn on a workspace they're not currently viewing

End of Phase 6 = **end of v0.0.1 MVP**.

---

## Anti-regression checks across all phases

Run these greps + assertions at the end of every phase :

- **Worktree boundary** : `~/.mozart/worktrees/{id}/` only in
  `worktree.adapter.ts`
- **Vocabulary** : zero matches for `worktree|HEAD|refs/heads|detached`
  in templates and user-facing strings
- **Facade gate** : `inject(\w*Store)` and `inject(\w*ADAPTER)`
  outside `data/` folders → zero
- **Adapter discipline** : `@tauri-apps/api` imports only in
  `tauri-*.adapter.ts` files
- **Dumb component purity** : facade / store imports inside
  `libs/ui/**` → zero
- **Public API hygiene** : domain `index.ts` files re-export only
  features / ui / facade / type — not stores, not adapter tokens
- **OnPush coverage** : all components have
  `ChangeDetectionStrategy.OnPush`
- **Parser purity** :
  `grep -rn '@angular\|@tauri-apps\|window\|document'` in
  `domains/llm-model/data/stream/` → zero
- **Auth gate** : every route except `/welcome` requires a valid
  token (after Phase 5)

---

## Out of scope (post-MVP)

The ideas below are explicitly deferred beyond v0.0.1 MVP.
Captured here so we remember them when planning post-MVP work.

### Composer shortcuts (`/` skills + `@` context)

**Why deferred** : the chip-based attachment surface, the
`HlmCombobox` overlay at caret, the skill-resolution table, and
the multi-provider compatibility layer add significant scope
without being critical to the MVP loop (add project → workspace
→ chat → agent edits files → commit → PR). The MVP composer is
just textarea + mode + model + effort + send.

**When this lands (post-MVP)** :

- **`/` skills** :
  - Press `/` → `HlmCombobox` overlay at caret with skill list
    (groups + separators)
  - Typing filters
  - Tab / click / Enter selects → skill text becomes an atomic
    chip in the textarea (Notion-style ; Backspace deletes the
    whole chip, can't be edited mid-text)
- **`@` context** :
  - Press `@` → `HlmCombobox` overlay at caret with context
    groups : Terminal, Web, PRs, Workspaces (grouped by project,
    current first), Chats (grouped by workspace, current first),
    Other
  - Filter shortcuts : `@@` → Web (URL input in chip), `@#` →
    PRs, `@>` → Terminal, `@&` → Workspaces, `@$` → Chats
  - Tab / click / Enter selects → context becomes an atomic chip
    inline `[icon|name]` (e.g. `[m|readme.md]`, `[#42|repo-name]`
    for PRs)
- **Multi-context** : multiple chips per message. Warning visual
  at 5+ chips. Order = order of attachment.
- **`+` button (bottom-left)** : context menu duplicating the
  `@` options for users who prefer clicking.

**Required data model when this ships** :

```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,           -- 'mozart' | 'user' | 'project'
  project_id TEXT,               -- NULL unless scope = 'project'
  provenance TEXT NOT NULL,      -- 'mozart' | 'user' | 'claude-code' | 'imported'
  name TEXT NOT NULL,
  description TEXT,
  body TEXT NOT NULL,            -- the prompt template
  locked BOOLEAN NOT NULL DEFAULT FALSE,  -- can't be deleted/edited
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_skills_scope_project ON skills(scope, project_id);

ALTER TABLE messages ADD COLUMN attached_skills TEXT;   -- JSON array
ALTER TABLE messages ADD COLUMN attached_contexts TEXT; -- JSON array
```

Skills resolution order : `project` → `user` → `mozart` (closer
scope wins on name conflict). Project initialization can import
detected Claude-Code-style skills files into the `project`
scope.

A future **Skills marketplace** in `apps/web` may publish
community skills to the `user` scope.

### Other deferred items

### Sidebar Chats group + non-contextualized chats

**Why deferred** : the MVP loop is workspace-centric (project →
workspace → chat → agent edits → commit → PR). Adding a parallel
chat browsing surface and a special "system workspace" for chats
without a project muddies the MVP without serving the core
hypothesis. It's a clear post-MVP feature.

**When this lands** :

- A new **Chats group** in the sidebar, below Projects :
  - Lists all chats chronologically, grouped by `Today /
Yesterday / Last 7 days / Older`
  - Each entry : chat title (generated from first prompt ;
    `Untitled` if blank) + status icon if streaming
  - Bold if unread
  - Click → navigates to the chat
- A **hidden system workspace** per user (id pattern like
  `__system_chats__:{user_id}`) that holds chats not bound to
  any project. Not displayed in the sidebar Projects group ;
  surfaces only via the sidebar Chats group.
- A `+ New ask chat` button on the Chats group title → creates a
  new chat in the system workspace with `mode = 'ask'`.
- **Chat context menu** :
  - `Rename`
  - `Delete`
  - `Go to workspace` (only visible if the chat is bound to a
    real workspace — the menu shows up everywhere a chat is
    listed, including the future unified chat view)

**Required schema migration when this ships** :

```sql
-- The system workspace insert per user :
INSERT OR IGNORE INTO workspaces (id, task_id, name, branch, base_branch, status, worktree_path, created_at)
VALUES ('__system_chats__:' || ?, '__system_task__', '__system__', 'mozart/__system__', 'main', 'idle', '/dev/null', strftime('%s','now') * 1000);
```

### GitHub-Mozart linked account (idea to explore)

**Status** : speculative — to flesh out post-MVP.

The idea : Mozart has a first-class GitHub App / Mozart-owned
GitHub identity that users link to their personal GitHub account
during the onboarding. Unlocks several use cases :

- **Shared blank projects** : when a user creates a project via
  Quick start with no GitHub repo, Mozart can host it under a
  `mozart-projects/{slug}` org and the user is added as
  collaborator. Lets users share project context without yet
  having a personal repo.
- **Collaboration visibility** : Mozart sees who's working on
  what across multiple users via the shared org, enables
  workspace handoff between teammates (early multi-user signal
  on the v1.0.0 coordination vision).
- **Cross-user skills marketplace** : skills authored by user A
  can be discovered by user B because both are visible to the
  Mozart GitHub App.
- **PR co-authorship** : PRs created by Mozart on behalf of a
  user are co-signed by `mozart-bot`, giving the act of
  creating a PR through Mozart a small recognizable footprint.

**Risks / open questions** :

- GitHub App permissions model (read-only vs write to user's
  personal repos)
- Trust / security : users must opt in explicitly and
  understand what Mozart sees / does on their behalf
- Cost : a Mozart-owned GitHub Enterprise / Org tier
- Privacy : the shared-org pattern for blank projects must be
  opt-in (default = private to user)

To explore in a dedicated design doc before any implementation.

### Other deferred items

- **Saved & organized chats** : favorite / rename / folders /
  tags / cross-chat search
- **Domain `metrics`** : time used per provider / model /
  project, tokens consumed, tokens saved by Mozart strategies
- **Offline PR management** : semi-remote internal PRs with
  merge + conflict resolution. Combined with a local LLM, fully
  offline workflow.
- **Task workflow + conflict management UI** : the v1.0.0
  coordination vision (parallel agents, candidate review, merge
  decision)
- **Low-code zen code editor** inside Mozart
- **Shortcut bar / global command palette** (`Cmd+K`-style)
- **Offline chat send / queue** when no connection
- **Multi-provider LLM** : OpenAI, OpenRouter, local — UI
  scaffolding is in Phase 6 but full implementation is post-MVP
- **Resizable / collapsible right aside**
- **Search / command trigger in the sidebar top** (was in the
  initial sidebar mockup, deferred)
- **Multi-org / multi-owner GitHub** flows beyond the default
  user
- **PR review + comment inside Mozart**
- **Tab bar `file` variant** (already designed in
  `WorkspaceTabBar` but not routed in MVP — file tabs become
  relevant when in-Mozart editing ships, far post-MVP)
- **Tech-stack auto-detection** for the Empty template
  `.gitignore` and the project init command (Phase 1 ships
  Node-default `npm install` only ; cargo / pip / etc. are
  post-MVP)

---

_End of v0.0.1 MVP plan._
