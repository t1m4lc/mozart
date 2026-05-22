# CLAUDE.md

Mozart (`mozart.build`) is an AI coding agent manager wrapping Claude Code CLI.

Read this file as behavioral rules, not project documentation.

## Source of truth

Open only the relevant section when needed.

**Canonical (read these for current state):**

- Product plan: `docs/specs/plan-v0.1.0-beta.1.md` (first non-public beta; `v0.1.0` is reserved for the first public release)
- Product architecture vision: `docs/specs/mozart-product-architecture-specs.md`
- Architecture & versioning: `docs/specs/mozart-architecture.md`
- Other in-flight specs and plans: `docs/specs/*.md`
- Functional test scenarios: `docs/test/`
- Active operational backlogs/TODOs: `docs/plans/`
- Landing deploy reference: `docs/landing/`
- Developer setup guides: `docs/guides/`
- Design tokens (live source): `libs/mozart-design-tokens/`

**Do NOT read by default:**

- `docs/archive/**` — historical / deprecated material (v0.0.1-era audits and plans, completed phase prompts, superseded UI plans, finished spec/done items, legacy test scenarios). Kept only for historical context and MUST NOT be treated as source of truth. Only open when explicitly asked "why did we do X back then?".

## Stack

Monorepo Nx + pnpm.

- `apps/desktop/`: Angular 21 + Tauri v2 desktop app
- `apps/web/`: Angular 21 future cloud UI
- `apps/sandbox/`: Angular 21 dev-only dogfooding app for libs/mozart-ui components
- `libs/ui/`: vendored Spartan NG / Hlm primitives (read-only — see Design system)
- `libs/mozart-ui/`: Mozart-specific reusable UI components (composer, timeline, highlight-overlay)
- `libs/shared-util-theme/`: ThemeService + provideTheme()
- `libs/mozart-design-tokens/`: global CSS + design tokens (fonts, Tailwind v4 `@theme`, Spartan UI theme variables, brand colors)

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

`libs/ui/**` is read-only during desktop feature work — these are vendored Spartan NG / Hlm primitives.

Do not modify, add, delete, or refactor anything under `libs/ui/**` unless the user explicitly approves it.

Mozart-owned reusable components live in `libs/mozart-ui/**` and ARE editable.

Use existing components from:

```ts
import { ... } from '@mozart/ui/<spartan-component>';   // primitives
import { ... } from '@mozart-ui/<mozart-component>';    // mozart-owned (composer, timeline, highlight-overlay)
```

## Module boundaries

Every project is tagged with exactly one `scope:*` tag in its `project.json`.
The `@nx/enforce-module-boundaries` ESLint rule enforces:

- `scope:app` → `scope:app | scope:mozart-ui | scope:spartan | scope:shared`
- `scope:mozart-ui` → `scope:mozart-ui | scope:spartan | scope:shared`
- `scope:spartan` → `scope:spartan | scope:shared`
- `scope:shared` → `scope:shared` (only)

Run `bash tools/verify-scope-tags.sh` after adding a new project — a missing tag silently exempts the project from the boundary rule.

## Commit discipline

1. **Always ask before committing.** Never commit without explicit human approval, even when the work looks complete, even after a manual checkpoint passed, even for a one-liner. The user reviews the diff and says "commit" before any `git commit` runs.

2. **After approval, commit atomically in a single shell command.** Always:

   ```bash
   git add <path1> <path2> ... && git commit -m "..."
   ```

   Never split `git add` and `git commit` across two invocations on a shared branch — another parallel chat working on a different atom on the same branch could race the index and accidentally include foreign staged files in your commit.

3. **Stage explicit paths only.** Never `git add -A`, `git add .`, or `git add -u`. List the files this atom touched. The project hook blocks bulk staging; the rule is also defense-in-depth against committing unrelated work that a parallel chat staged.

4. **One atom = one commit.** Don't bundle multiple atoms into a single commit. The plan's checkbox tracking depends on atom-sized commits.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Angular Signals

Prefer `computed()` and `linkedSignal()` over `effect()`.

Use `effect()` only for imperative external side effects. Do not use it to copy signal state, reset UI state, or derive values.
