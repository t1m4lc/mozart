# CLAUDE.md

---

statusline:
command: tools/claude-status-line.sh

---

## Source of truth

- Plan: `docs/specs/plan-v0.1.0-beta.1.md`
- Ignore: `docs/archive/**`

## Stack

Nx monorepo + pnpm · Angular 22 + signals + SignalStore · Tailwind v4 · Spartan NG · Tauri v2

**Nx rules:** use MCP/project graph before editing libs/imports/routes/tags. Respect boundaries.
Use Nx graph before reading many files `pnpm nx graph --print --focus=<project>` or after changes `pnpm nx graph --print --affected`

## Design system

- `libs/spartan-ui/**` → **read-only** (Spartan/Hlm primitives). No edits without explicit approval.
- `libs/mozart-ui/**` → editable Mozart components.

## Module boundaries

`@nx/enforce-module-boundaries` is enforced. Every project carries tags across these axes (see `eslint.config.mjs`):

- `app:*` — per-app domain libs (e.g. `app:desktop`). May depend on `app:desktop`, `scope:mozart-ui`, `scope:spartan`, `scope:shared`.
- `domain:*` — domain grouping (e.g. `domain:chat`). Advisory; not used by boundary rules.
- `type:*` — layer axis. `feature → feature|ui|data-access|util`, `ui → ui|util`, `data-access → data-access|util`, `util → util` (all may also reach `scope:mozart-ui|spartan|shared`).
- `scope:*` — legacy axis, still used by `libs/spartan-ui`, `libs/mozart-ui`, `libs/shared-*`, and `apps/*`. Each project carries at most one `scope:*` and at most one `app:*`.

Run `tools/verify-scope-tags.sh` to confirm every project has an ownership tag.

## Commits

**Never commit without explicit human approval.** Wait for "commit" before any `git commit` runs. Then commit atomically in a single shell command.

## Scaffolding

For new apps/libs/structure: invoke `nx-generate` skill **first**, before MCP tools or exploration.

## Angular

Prefer `computed()` and `linkedSignal()` over `effect()`.
