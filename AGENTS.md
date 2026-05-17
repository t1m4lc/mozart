# AGENTS.md — Mozart

Operational map for AI agents.  
Read this first. Use `CLAUDE.md` for coding rules and constraints.

## Project

Mozart (`mozart.build`) is a desktop manager for Claude Code CLI.

Current target: v0.1.0-beta.1 (first non-public beta release; `v0.1.0` is reserved for the first public release).

## Sources

- Product plan: `docs/specs/plan-v0.1.0-beta.1.md`
- Design: `docs/DESIGN.md`
- Product architecture vision: `docs/specs/mozart-product-architecture-specs.md`
- TODO: `docs/TODO.md`
- Agent rules: `CLAUDE.md`

## Repo map

```txt
apps/desktop/              Angular + Tauri desktop app
apps/web/                  future cloud UI
apps/landing/              landing app, if present
libs/ui/                   design system; see CLAUDE.md before touching
libs/shared-util-theme/    theme utilities
libs/shared-styles-theme/  global theme styles
docs/                      specs, design, planning
tmp/ready-plans/           ready plans
tmp/done-plans/            completed plans
```

## How to work

Default flow:

```txt
/discussion → /plan → /atomize → /implement
```

Rules:

- Discuss before large changes.
- Plan before editing.
- Atomize large plans into small tasks.
- Implement one atom at a time.
- Move completed plans from `tmp/ready-plans/` to `tmp/done-plans/`.

## Before editing

Identify:

- Target feature or bug.
- Relevant spec section.
- Smallest file set.
- Validation command to run.

If unsure, inspect targeted files only.

Do not broad-scan the repo by default.

## Commands

Use the narrowest useful command.

```bash
pnpm dev
pnpm nx serve desktop
pnpm nx lint desktop
pnpm nx test desktop
pnpm nx build desktop
pnpm nx e2e desktop-e2e
pnpm nx run-many -t lint test
pnpm nx sync
```

For Rust/Tauri, run from `apps/desktop/src-tauri` when needed:

```bash
cargo test
```

## Commits

One logical commit per atom.

Never use:

```bash
git add .
```

Stage only intended files.

Commit format:

```txt
feat(M{N}): <what>
fix(M{N}): <what>
docs(M{N}): <what>
refactor(M{N}): <what>
test(M{N}): <what>
chore(M{N}): <what>
```

Do not add Claude co-author trailers.

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
