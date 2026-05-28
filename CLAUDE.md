# CLAUDE.md

---

statusline:
command: tools/claude-status-line.sh

---

# Core Rules

- If ambiguous: ask questions. Never silently assume.
- Define "done" before coding (1 short sentence).
- Always verify latest code before editing.
- Minimal diff only.
- No speculative features.
- No unnecessary abstractions.
- Prefer existing patterns over inventing new ones.
- Keep architecture consistency.
- Prefer readability over cleverness.
- KISS.
- Stop and ask if unsure.

---

# Source of Truth

- Main plan: `docs/specs/plan-v0.1.0-beta.1.md`
- Ignore completely: `docs/archive/**`

---

# Stack

- Nx monorepo + pnpm
- Angular 22
- Signals + NgRx SignalStore
- Tailwind CSS v4
- Spartan NG
- Tauri v2 with Rust

---

# Nx Rules

- Use Nx graph/MCP before editing libs/imports/routes/tags.
- Respect module boundaries.
- Prefer existing libs before creating new ones.
- Read the minimum amount of code needed.

Useful commands:

```bash
pnpm nx graph --print --focus=<project>
pnpm nx graph --print --affected
```

For new apps/libs:

- Use `nx-generate` first.

---

# Design System

- `libs/spartan-ui/**`
  - Read-only.
  - Never edit without explicit approval.

- `libs/mozart-ui/**`
  - Editable Mozart UI components.

---

# Angular Rules

## Signals

- Prefer signals-first APIs.
- Prefer `computed()` and `linkedSignal()` over `effect()`.
- Use `effect()` only for real side effects.
- Avoid state-sync effects.

## RxJS

- Prefer composition/operators.
- Avoid nested subscriptions.
- Avoid imperative async flows.

## Components

- Keep components focused and small.
- Avoid huge smart components.
- Avoid dumb UI components used only once.
- Keep logic close to the feature using it.
- Split by responsibility, not artificially.

## State

- Prefer local state first.
- Use NgRx SignalStore patterns.
- Avoid global state unless necessary.

## UX

Always handle:

- loading
- optimistic updates
- empty states
- error states

Use skeletons/loaders when needed.

---

# Performance

- Lazy load heavy features by default.
- Avoid eager initialization.
- Avoid unnecessary recomputation.
- Reuse computed state.

---

# General Code Rules

- Prefer composition over inheritance.
- Prefer functional approaches when simple.
- Avoid over-engineering.
- Avoid magic behavior.
- Prefer explicit code.
- Keep files/components reasonably small.

## Comments

- Default to no comments. Let well-named code speak.
- Only comment a non-obvious WHY: hidden constraint, workaround for a known bug, surprising behavior.
- Keep them short. One line if possible, never multi-paragraph.
- No "what" comments (the code says it).
- No PR/issue refs, no "added for X flow" — those rot.

---

# Module Boundaries

Layer rules:

- `feature` → `feature|ui|data-access|util`
- `ui` → `ui|util`
- `data-access` → `data-access|util`
- `util` → `util`

General rules:

- Keep business logic out of UI-only layers.
- Avoid cross-domain leakage.
- Shared code must be truly reusable.

Verification:

```bash
tools/verify-scope-tags.sh
```

---

# Git Rules

- Never commit without explicit human approval.
- Wait for the word: `commit`
- Use Conventional Commits.
- Format: `<type>(optional-scope): <description>`
- Common types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`.
- Make atomic commits only.
- Never auto-push.
