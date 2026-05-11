# CLAUDE.md

Mozart (`mozart.build`) is an AI coding agent manager wrapping Claude Code CLI.

Read this file as behavioral rules, not project documentation.

## Source of truth

Open only the relevant section when needed:

- Product plan: `docs/PLAN-v0.0.1.md`
- Design: `docs/DESIGN.md`
- Canonical model: `docs/specs/plan-v0.0.1-2.md` §3
- Product architecture vision: `docs/specs/mozart-product-architecture-specs.md`

## Stack

Monorepo Nx + pnpm.

- `apps/desktop/`: Angular 21 + Tauri v2 desktop app
- `apps/web/`: Angular 21 future cloud UI
- `libs/ui/`: internal Spartan NG / Hlm design-system
- `libs/shared-util-theme/`: ThemeService + provideTheme()
- `libs/shared-styles-theme/`: global CSS + theme tokens

Use Angular standalone components, signals, SignalStore, Tailwind CSS v4, Spartan NG components, and Tauri v2.

## Product vocabulary

Use these terms consistently:

- Project = repository
- Task = user intent
- Workspace = isolated execution attempt + reviewable diff
- Thread = chat
- Agent Run = one execution turn
- Changes = diff snapshot

Never expose internal Git implementation details in user-facing UI.

Forbidden in UI labels, dialogs, toasts, onboarding, and settings:

- `worktree`
- `worktree_path`
- `branch_name`
- `base_branch`
- `git worktree`
- `detached HEAD`
- `HEAD~1`
- `checkpoint sha`
- `agent/wip-*`

These are allowed only in logs or dev-only diagnostics.

## Design system

`libs/ui/**` is read-only during desktop feature work.

Do not modify, add, delete, or refactor anything under `libs/ui/**` unless the user explicitly approves it.

Use existing components from:

```ts
@mozart/ui/<component>
```
