# CLAUDE.md

Mozart (`mozart.build`) — AI coding agent manager wrapping Claude Code CLI.
Specs: `docs/PLAN-v0.0.1.md` · Design: `docs/DESIGN.md`

## Product vocabulary

Source of truth: `docs/specs/plan-v0.0.1-2.md` § 3 (canonical model). Vision narrative: `docs/specs/mozart-worktree-swarm-design-synthese.md`.

| #   | Term                   | Lives as (DB)                                                       | Shown in UI as                                                                    | Hidden from UI? |
| --- | ---------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------- |
| 1   | **Project**            | `repos` row                                                         | "Project" or "Repository" (synonyms)                                              | no              |
| 2   | **Task**               | `tasks` row                                                         | "Task" — the user-stated intent                                                   | no              |
| 3   | **Workspace**          | `workspaces` row                                                    | "Workspace" — isolated execution attempt + reviewable diff                        | no              |
| 4   | **Thread**             | `threads` row                                                       | "Chat" — v0.0.1 implicit (1:1 with workspace, no UI surface yet)                  | mostly hidden   |
| 5   | **Agent Run**          | `agent_runs` row                                                    | "Run" / conversation turn                                                         | no              |
| 6   | **Workspace Changes**  | `workspace_changes` row                                             | "Diff" / "Changes"                                                                | no              |
| 7   | **Candidate Solution** | derived view: workspaces in same task_id × latest workspace_changes | "Candidate" — appears at v0.1, hidden in v0.0.1                                   | partial         |
| 8   | **Merge Decision**     | manual buttons in v0.0.1; future entity in v0.1                     | "Commit / Discard / Merge / Archive"                                              | no              |
| —   | **Working tree**       | `workspaces.worktree_path` column                                   | —                                                                                 | **yes, never**  |
| —   | **Branch**             | `workspaces.branch_name` / `workspaces.base_branch`                 | shown only as a small subtitle on a Workspace card; never user-editable in v0.0.1 | partial         |

**Forbidden in user-visible strings (UI labels, error toasts, copy):** `worktree`, `branch_name`, `base_branch`, `worktree_path`, `agent/wip-…`, `detached HEAD`, `git worktree add`, `HEAD~1`, `checkpoint sha`.

**Allowed in dev-only strings (logs, inline diagnostic banners marked Dev):** all of the above. The check is on what reaches users in Onboarding / Settings / Dialog / Toast surfaces, not on logs.

ASCII data flow:

```
Project (repos)
   │
   └── Task (tasks)                  ← user intent
         │
         └── Workspace (workspaces)  ← isolated execution attempt
               │   └─ branch_name
               │   └─ base_branch
               │   └─ worktree_path  (internal)
               │
               └── Thread (threads)            ← v0.0.1: 1:1
                     │
                     └── Agent Run (agent_runs)
                           │
                           ├── Agent Events (agent_events)         ← stream log (replay/debug)
                           └── Workspace Changes (workspace_changes) ← diff snapshot per run

(Candidate Solution at v0.1 = group of Workspaces sharing a task_id, ranked by their workspace_changes.)
```

## Layout

```
apps/desktop/        Angular 21 + Tauri v2 (hash routing, entry: src-tauri/src/lib.rs)
apps/web/            Angular 21 (future cloud UI)
libs/ui/             ~50 component libs (one Nx lib each)
libs/shared-util-theme/   ThemeService + provideTheme()
libs/shared-styles-theme/ base.css + themes/zinc.css
```

## UI components (libs/ui — READ ONLY, never modify)

**Available components** (spartan.ng/components):
Accordion, Alert, Alert Dialog, Aspect Ratio, Autocomplete, Avatar, Badge, Breadcrumb, Button, Button Group, Calendar, Card, Carousel, Checkbox, Collapsible, Combobox, Command, Context Menu, Data Table, Date Picker, Dialog, Dropdown Menu, Empty, Field, Hover Card, Icon, Input, Input Group, Input OTP, Item, Kbd, Label, Menubar, Native Select, Navigation Menu, Pagination, Popover, Progress, Radio Group, Resizable, Scroll Area, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner (Toast), Spinner, Switch, Table, Tabs, Textarea, Toggle, Toggle Group, Tooltip

- Vendored Spartan NG Hlm — Angular directives over `@spartan-ng/brain` + Tailwind CVA
- Import: `@mozart/ui/<name>` · Selectors: `hlm` prefix (`button[hlmBtn]`, `hlm-card`)
- Styling: `cva(base, { variants })` + `classes()` from `@mozart/ui/utils`
- `classes()` uses `effect()` + MutationObserver to merge host classes — **never mix with plain `[class]` binding**
- New component: generate lib → `src/lib/hlm-<name>.component.ts` (inline template+styles) → export from `index.ts` → add alias in `tsconfig.base.json`
- **Protection.** `libs/ui/**` is the internal design-system library and is never modified during desktop feature work or UI refactors. New visual primitives go in `apps/desktop/src/app/`, composed from existing `libs/ui/*` components. If you genuinely believe a primitive is missing in `libs/ui`, stop and ask the user before touching anything in `libs/ui`.

## Angular best practices (functional style)

**DI — always `inject()`, never constructor params**

```ts
readonly router = inject(Router);
readonly store  = inject(Store);
```

**Signals-first state**

```ts
readonly count   = signal(0);                          // local state
readonly doubled = computed(() => this.count() * 2);   // derived
readonly name    = input<string>();                     // @Input replacement
readonly saved   = output<void>();                     // @Output replacement
// effect() only when you must react to a signal outside the template
```

**Access modifiers**

- `readonly` on every `input()`, `output()`, `model()`, query
- `protected` on members used only in the template (not public API)

**Templates**

- Prefer `[class.foo]="expr"` over `[ngClass]` · `[style.color]="expr"` over `[ngStyle]`
- Complex logic → `computed()` in the class, not inline expressions
- Event handler names describe the action: `saveUser()` not `handleClick()`

**Structure**

- Feature-based folders, not type-based (`/session/`, not `/services/`)
- One concept per file · kebab-case filenames (`user-profile.ts`)
- Keep lifecycle hooks thin — delegate to named methods

## State management — `@ngrx/signals` SignalStore

- Stateful app code uses `signalStore({ providedIn: 'root' }, withDevtools(name), withCallState({ collection }), withState(initial), withMethods(...), withComputed(...), withHooks(...))`.
- Async loaders use `rxMethod<T>(pipe(switchMap(...), tapResponse({ next, error, finalize })))` — never raw `subscribe()` in store methods.
- Never reach for `@Injectable` + bare `signal()` for new stateful services. Stateless utilities (IPC wrappers, keyboard handlers, formatters) stay `@Injectable({ providedIn: 'root' })`.
- One store = one feature slice. Cross-store reads via `inject(OtherStore)` inside `withMethods` / `withComputed`.

## Keyboard shortcuts

- All keyboard bindings go through `ShortcutService` (`services/shortcut.service.ts`). Components call `register$(input)` and take until destroyed (`takeUntilDestroyed()`), or use `[mzShortcut]` template directive.
- `Shortcut` API: `key`, `command`, `description`, `throttleTime`, `label`, `preventDefault`. Use `allowIn` to fire inside inputs/textareas; default is blocked.
- `key: 'all'` matches every keydown — reserved for command-palette priming. Use sparingly.

## IPC validation — zod

- Every Tauri command response is parsed by a zod schema in `shared/schemas/`.
- DTOs derive from schemas via `z.infer<typeof X>` — never hand-typed parallel interfaces.
- Schema parse failures become `MozartError` with `kind: 'Validation'`; never surface raw zod errors to the UI.
- Forms (plan 11) declare a request DTO schema, parse user input, and reject with field-level errors before invoking IPC.

## TDD discipline

- Spec file is created **before** the implementation file for every new TS module under `apps/desktop/src/app/`. Red → Green → Refactor.
- Specs run via `pnpm nx test desktop`. Use `TestBed.configureTestingModule` for signalStores with fakes for cross-service deps.
- `_bindings.ts` is gitignored and regenerated on every `pnpm dev`. Specs that need it run after a manual regen step.

## Forbidden patterns

- `any` — use `unknown` + zod parse at the boundary.
- New NX libs for app-specific code — keep it in `apps/desktop/src/app/` until reuse from `apps/web` is real.
- `@Injectable` + raw `signal()` for app state — use `signalStore`.
- Eager `Observable.subscribe()` without `takeUntilDestroyed()` or `takeUntil(stop$)`.
- Hardcoded color hex in templates/styles — every color goes through `var(--mozart-token)`.
- Date math via raw `new Date()` — use `dayjs` (plan 09 onward; plan 08 ships the dep only).
- Free-form button labels in disabled v0.2 controls — every disabled control carries an `[hlmTooltip]` naming the milestone unblocking it (per DESIGN.md Rule 7).

## Token discipline

To keep planning + implementation fast and cheap, agents must follow these read rules:

- **Do not read `**/\*.spec.ts`under`apps/`\*\* unless the active task is explicitly about tests, test failures, or coverage. Specs are noisy and rarely needed for feature/refactor work. The implementation file next to the spec is the source of truth for behavior.
- **Do not read anything under `docs/competitors/**` except:\*\*
  - `docs/competitors/conductor/design/conductor-ui.png` (Conductor visual reference)
  - `docs/competitors/conductor/design/ui-notes.md` (structured Conductor breakdown)
    Other competitor folders (cursor, codex, etc.) are background research, not implementation input.
- **Do not modify anything under `docs/competitors/**`\*\* — it is a read-only research archive.
- **Prefer focused, scoped reads.** Read the specific source file, the spec section in `docs/PLAN-v0.0.1.md`, or `CLAUDE.md` itself. Avoid broad `grep`/`find` scans across the whole tree when a targeted lookup answers the question.
- **Avoid opening large unrelated files** (>500 lines) unless the task specifically touches them. If you must read a long file, use `Read` with `offset`/`limit` and a known heading.

These rules supersede the default "explore freely" instinct. If a task genuinely requires breaking one of them (e.g., a failing spec that needs reading), say so explicitly in your text output.

## Tauri v2 best practices

**Rust commands**

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn my_command(state: tauri::State<'_, MyState>) -> Result<String, String> {
    Ok("result".into())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![my_command])
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

**JS side**

```ts
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<string>('my_command');
```

**Rules**

- Use `async fn` for all I/O commands — never block the async runtime
- Permissions live in `src-tauri/capabilities/` (Tauri v2 ACL model)
- TS bindings auto-generated via `tauri-specta` (planned) — don't hand-write them
- Prefer `tauri::State` for shared app state over globals

## Conventions

- Inline template + inline styles, no `.spec.ts` by default (see `nx.json`)
- `unitTestRunner: none` on libs — add tests explicitly
- No default exports
- Bundle budget: 500 KB/1 MB initial · 4 KB/8 KB per component style

## Key deps

| Package                    | Role                                            |
| -------------------------- | ----------------------------------------------- |
| `@spartan-ng/brain`        | Headless primitives                             |
| `class-variance-authority` | Variant classes                                 |
| `clsx` + `tailwind-merge`  | Class merging (`hlm()` from `@mozart/ui/utils`) |
| `@ng-icons/lucide`         | Icons (`ng-icon` from `@mozart/ui/icon`)        |
| `@tauri-apps/api`          | JS↔Rust bridge                                 |
| `tailwindcss` v4           | PostCSS, no `tailwind.config.js`                |
