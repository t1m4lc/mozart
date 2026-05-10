# CLAUDE.md

Mozart (`mozart.build`) — AI coding agent manager wrapping Claude Code CLI.
Specs: `docs/PLAN-v0.0.1.md` · Design: `docs/DESIGN.md`

## Commands

```sh
pnpm dev                        # Angular + Tauri (desktop)
pnpm nx serve desktop           # Angular only
pnpm nx build desktop           # Angular bundle
pnpm nx run desktop:tauri-build # Tauri binary
pnpm nx test <project>          # vitest
pnpm nx lint <project>
pnpm nx e2e desktop-e2e         # Playwright
pnpm nx run-many -t test        # all tests
pnpm nx sync                    # TS project references
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
