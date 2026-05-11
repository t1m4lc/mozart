# AGENTS.md — Mozart

Operational map for AI agents.  
Read this first. Use `CLAUDE.md` for coding rules and constraints.

## Project

Mozart (`mozart.build`) is a desktop manager for Claude Code CLI.

Current target: v0.0.1.

## Sources

- Product plan: `docs/PLAN-v0.0.1.md`
- Design: `docs/DESIGN.md`
- Step plan / canonical model: `docs/specs/plan-v0.0.1-2.md`
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
