# AGENTS.md — Mozart

Map for AI agents. Read this first, every session. Pair with `CLAUDE.md` for depth.

## Project

**Mozart** (`mozart.build`) — desktop manager for the Claude Code CLI. Three-panel dark IDE.
Current sprint: **v0.0.1**. Specs: `docs/PLAN-v0.0.1.md` · Design: `docs/DESIGN.md` · Milestones (M1–M13): `docs/mozart-implementation-flow.md`

## Stack

| Layer    | Tech                                                      |
| -------- | --------------------------------------------------------- |
| Monorepo | Nx + pnpm workspaces                                      |
| Desktop  | Angular 21 + Tauri v2 (`apps/desktop`)                    |
| Web      | Angular 21 (`apps/web`)                                   |
| Landing  | Astro (planned, `apps/landing`)                           |
| UI lib   | Spartan Hlm — vendored, **`libs/ui/*` is READ ONLY**      |
| Backend  | Rust (Tauri v2), SQLite WAL, `tauri-specta` IPC (planned) |

## Commands

```sh
pnpm dev                        # Tauri desktop dev
pnpm nx serve desktop           # Angular only
pnpm nx build desktop           # Angular bundle
pnpm nx run desktop:tauri-build # Full Tauri binary
pnpm nx run-many -t lint test   # Lint + test everything
pnpm nx test <project>
pnpm nx lint <project>
pnpm nx e2e desktop-e2e         # Playwright
pnpm nx sync                    # Sync TS project references
cargo test -p desktop           # Rust (from apps/desktop/src-tauri)
```

## Conventions (see CLAUDE.md for full detail)

- 2-space indent · `camelCase` vars · `PascalCase` components · `kebab-case` files
- `@mozart/*` aliases only — never relative `../../` · aliases in `tsconfig.base.json`
- Angular: standalone, inline template+style, functional style (`inject()`, signals, `input()`/`output()`)
- `libs/ui/*` — **never modify** · use existing Spartan components, check the list in `CLAUDE.md`
- `classes()` from `@mozart/ui/utils` for dynamic class merging — never mix with plain `[class]`
- Tauri: `async fn` commands only · permissions in `src-tauri/capabilities/` · no hand-written TS bindings

## The One-Way Rule

Before adding any pattern: search for an existing one. If found → extend it. If not → document the new canonical pattern in `CLAUDE.md`.

## Workflow

```
/discussion → /plan → /atomize → /implement
```

- **`/discussion`** — clarity before code. Never edits source. Writes `.context/context.md`.
- **`/plan`** — codebase analysis + research → plan in `tmp/ready-plans/`.
- **`/atomize`** — converts plan into `TASKS.md`: atomic, parallelizable, with allowed/forbidden files, deps, acceptance criteria.
- **`/implement`** — one atom at a time, pauses for Q&A between atoms.

Plans: `tmp/ready-plans/` → `tmp/done-plans/` when done.

## Validation gate (before every commit)

```sh
pnpm nx run-many -t lint test
cargo test -p desktop   # if Rust changed
```

Never proceed past a failing gate. Stuck > 30 min → back to `/discussion`.

## Commit discipline

- One logical commit per atomic task · never `git add .` · stage only the atom's allowed files
- Format: `feat(M{N}): <what>` · `fix(M{N}): <what>` · `chore(M{N}): <what>`
- `includeCoAuthoredBy: false` (set in `.claude/settings.json`)

## Pointers

| What                    | Where                                |
| ----------------------- | ------------------------------------ |
| Architecture & patterns | `CLAUDE.md`                          |
| v0.0.1 specs            | `docs/PLAN-v0.0.1.md`                |
| Visual / token spec     | `docs/DESIGN.md`                     |
| Atomic milestones       | `docs/mozart-implementation-flow.md` |
| Competitor research     | `docs/competitors/`                  |
