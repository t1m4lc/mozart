# Blog: Before Your First /discussion — The Repository Setup That Makes Everything Work

**Source:** https://runpane.com/blog/before-your-first-discussion  
**Author:** Parsa (Dcouple Inc) · 2026-04-16

---

## Core Principle: The Repo Is the System of Record

Agents can't access Google Docs, Slack, or your head. If context isn't in the repo, it doesn't exist to the agent. Every architecture decision, naming convention, library choice rationale, import pattern — all of it must live in the repo or the agent will invent it.

---

## Progressive Disclosure: Two-File System

Don't put everything in one file. Agents lose attention on huge files, waste context on irrelevant sections, or miss the one convention that matters.

### AGENTS.md — The Map (< 100 lines)
- Project structure overview
- Build/dev/lint/typecheck commands (`pnpm dev`, `pnpm lint`, `pnpm typecheck`)
- Coding conventions: 2-space indent, camelCase vars, PascalCase components, kebab-case filenames
- Testing guidelines
- Commit rules
- Pointers to deeper docs
- **Every agent reads this first, every time. Fits in context comfortably.**

### CLAUDE.md — The Manual (up to ~30k chars)
- Full architecture reference (main process + renderer + shared types)
- Database schema
- IPC communication patterns
- Every feature implemented
- Full technical stack
- **Agents reference this when they need depth on a specific area.**

---

## The .claude Directory — The Brain Agents Boot From

Every repo needs a `.claude` directory at its root. Once committed, every worktree inherits it automatically. Set it up once, never think about it again.

Pane's own `.claude` = 53 files:
- **5 agent definitions:** codebase-explorer, implementer, implementation-reviewer, plan-reviewer, researcher
- **10 skill directories:** discussion, plan, implement, commit, prepare-pr, investigate, simple-plan, research-web, review, share-fix
- **Slash commands:** organized by category (`cl/` for core pipeline, `linter/`, `refactor/` at 3 granularity levels, `review/` with 11-agent parallel orchestrator)
- **Plan template** (`plan_base.md`) with validation gates and lifecycle dirs (`ready-plans/` → `done-plans/`)

Reference: https://github.com/dcouple/Pane/tree/main/.claude

---

## Monorepo — Not Optional

If your API and frontend live in separate repos, agents can't:
- Trace data flow from database to UI
- Verify types match across boundaries
- Check that an endpoint they created has a client
- You become the integration layer

Every repo should be a monorepo. You become the integration layer if you don't.

**Mental model:**
- Workspace = a product (one workspace per repo)
- Pane = a feature (each gets its own git worktree)
- Tabs = activities within a pane (agent terminal, diff viewer, file explorer, git tree, logs)

---

## Mechanical Invariants (Automated Checks)

Where most agent setups fall apart: no automated way for agents to check their own work. You need:
- TypeScript strict mode
- ESLint zero-warnings policy
- `@typescript-eslint/no-explicit-any: 'error'`
- Custom linters for architectural boundaries
- Root scripts that delegate: `pnpm run typecheck && pnpm run lint`

If the agent can't run these and get a clean result, nothing else works.

---

## The Small Things That Compound

### 1. Path Aliases Over Relative Imports
`@/components/Button` not `../../../components/Button`  
Agents navigate by aliases. Relative paths break silently on file moves. Path aliases are stable.

### 2. Shared Types in One Package
`@myapp/shared` — types that cross boundaries live in one place, always.  
Agents don't guess where `User` type lives. It's in `shared/`. Always.

### 3. One Way to Do Everything (Most Critical Rule)
"If two hooks exist for audio recording, the LLM will create a third for the next feature."  
"If one unified hook exists, the LLM reuses it."  
Proliferation of patterns is the #1 way codebases become illegible to agents.

---

## Setup Checklist (Recommended Order)

1. Structure as monorepo (pnpm workspaces / Nx / Turborepo)
2. Configure validation loop (TypeScript strict + ESLint zero-warnings + pin node version)
3. Write AGENTS.md (map, < 100 lines)
4. Write CLAUDE.md (manual, grows over time as you encode agent mistakes)
5. Set up `.claude/` directory (use Pane's as starting point)
6. Commit everything to repo root (every worktree inherits automatically)
7. Start with `/discussion` — not `/implement`. Test if the agent can navigate your codebase first.
