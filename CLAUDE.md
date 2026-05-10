# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Mozart** (`mozart.build`) — an AI coding agent manager that wraps the Claude Code CLI, targeting developers. Competitor to Conductor.build. Three-panel dark IDE aesthetic (sidebar/center/right). v0.0.1 is the current sprint.

Product specs and design decisions live in `docs/PLAN-v0.0.1.md` and `docs/DESIGN.md`.

## Commands

```sh
pnpm dev                          # start desktop app (Angular + Tauri)
pnpm nx serve desktop             # Angular dev server only (no Tauri shell)
pnpm nx serve web                 # web app dev server
pnpm nx build desktop             # build desktop Angular bundle
pnpm nx run desktop:tauri-build   # build full Tauri binary
pnpm nx test <project>            # unit tests (vitest)
pnpm nx lint <project>            # ESLint
pnpm nx e2e desktop-e2e           # Playwright E2E
pnpm nx sync                      # sync TypeScript project references
```

Run any Nx target across all projects: `pnpm nx run-many -t test`.

## Architecture

### Monorepo layout

```
apps/
  desktop/          Angular 21 + Tauri v2 — primary app
    src/            Angular shell (uses hash routing)
    src-tauri/      Rust backend (tauri v2, currently minimal)
  web/              Angular 21 — future web/cloud UI (Clerk OAuth planned)
libs/
  ui/               Component library (~50 components, one Nx lib each)
  shared-util-theme/ ThemeService + provideTheme() provider
  shared-styles-theme/ CSS theme files (base.css + themes/zinc.css)
```

### UI component library (`libs/ui/*`)

Components are **vendored Spartan NG Hlm** — Angular directives that wrap `@spartan-ng/brain` headless primitives and apply Tailwind classes via CVA.

- Import path: `@mozart/ui/<component-name>` (e.g. `@mozart/ui/button`)
- Selectors use `hlm` prefix: `button[hlmBtn]`, `hlm-card`, etc.
- Styling pattern: `cva(baseClasses, { variants: {...} })` + `classes()` utility
- Components default to inline template + inline style (configured in `nx.json` generators)
- New UI components go in `libs/ui/<component-name>/src/lib/`

The `classes()` function from `@mozart/ui/utils` is the core primitive for dynamic class management — it uses Angular `effect()` + a MutationObserver to merge classes from multiple directives on the same element without clobbering each other.

### Theme system (`libs/shared-util-theme`)

`ThemeService` toggles the `dark` class on `<html>` and `theme-<name>` class on `<body>`. Currently only the `zinc` theme exists. Bootstrap with `provideTheme()` in `app.config.ts`.

```ts
// in app.config.ts
provideTheme()                    // defaults: theme='zinc', mode='system'
provideTheme({ mode: 'dark' })    // override
```

### Desktop app (Angular + Tauri)

- Angular uses `withHashLocation()` (required for Tauri file protocol)
- Tauri `tauri.conf.json` points `devUrl` at Angular's port 4200 and `frontendDist` at `dist/apps/desktop/browser`
- `pnpm dev` triggers `pnpm tauri dev` which automatically runs `pnpm nx serve desktop` first (configured in `beforeDevCommand`)
- Rust entry point: `apps/desktop/src-tauri/src/lib.rs` → `run()`

### Path aliases

All `@mozart/*` imports are defined in `tsconfig.base.json`. Add new libs there when created.

## Key dependencies

| Package | Role |
|---|---|
| `@spartan-ng/brain` | Headless UI primitives (behavior layer) |
| `class-variance-authority` | Variant-based class generation for UI components |
| `clsx` + `tailwind-merge` | Class merging (exposed via `hlm()` from `@mozart/ui/utils`) |
| `@ng-icons/lucide` | Icon set (use via `ng-icon` from `@mozart/ui/icon`) |
| `@tauri-apps/api` | JS ↔ Rust bridge (IPC, filesystem, shell) |
| `tailwindcss` v4 | Styling (PostCSS plugin, no tailwind.config.js) |

## Conventions

- Angular components: inline template, inline style, no test files (generator defaults in `nx.json`)
- Libraries: `unitTestRunner: none` by default; add tests explicitly when needed
- E2E runner: Playwright (`apps/desktop-e2e`, `apps/web-e2e`)
- Tauri commands will use `tauri-specta` for auto-generated TypeScript bindings (planned for v0.0.1)
- Bundle budget: 500KB warn / 1MB error initial, 4KB / 8KB per component style
