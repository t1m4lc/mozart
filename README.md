# Mozart

> **AI can write the notes. Mozart helps you compose the score and conduct the work.**

Mozart is a **coordination cockpit for parallel coding agents** — not a chat
client. It turns product intent into scoped agent workspaces, runs the work in
isolated git worktrees, and conducts every candidate through review to merge.

Worktrees let agents work in parallel. **Mozart decides how their work
should combine.**

---

## What Mozart actually is

A desktop **project operating system** built around three pillars:

1. **Repository-owned configuration** — `.mozart/settings.json` declares
   project behavior in a versionable, shareable file.
2. **Repository-owned specifications** — `.mozart/specs/` stores vision,
   epics, stories, and tasks as first-class objects Mozart can index, display,
   and feed to agents.
3. **Agent orchestration** — Mozart converts specs into task graphs,
   allocates isolated workspaces, runs agents in parallel, and coordinates
   review and merge.

The central object is not a chat — it's a **task** that may spawn one or more
**workspaces**, each producing a **candidate solution**, compared in a
**review**, and resolved by a **merge decision**.

```
Vision → Strategy → Epic → Story → Task
                              → Atomic Agent Task
                                → Run → Review → Merge
```

Different stages need different context depth. Mozart's job is to mediate
that compression — strategic context for planners, narrow scoped context for
coders, diff + acceptance criteria for reviewers.

## Positioning

| Tool              | What inspires Mozart                                    | What Mozart does differently                                       |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **Conductor**     | parallel agents, isolated workspaces, review-then-merge | open architecture, agent-agnostic, deeper coordination             |
| **Pane**          | agent-agnostic, worktree-as-implementation-detail       | not terminal-first; focuses on decision-making, not just execution |
| **Worktree CLIs** | one agent = one isolated sandbox                        | full UI for comparing and merging multiple solutions               |

- **Pane** decides *where* agents run
- **Conductor** decides *what* parallel agents do and how to merge
- **Mozart** decides *what* agents should do, *how* to compare their
  results, and *which* solution deserves trust

## Status

Currently shipping **v0.1.0-beta.1** — the first private beta. v0.1.0 is
reserved for the first public release. The roadmap is six demoable phases:

```
1. Project + Workspace flow       → add a project, auto-workspace, sidebar
2. Chat + Composer + Modes        → Agent / Plan / Ask, model, effort
3. Agent stream + Timeline        → Claude parser, raw text → cinematic UI
4. Git changes + Files + Terminal → diff, term, IDE, PR
5. Auth + Foundations             → Clerk gate, deep-link, /welcome
6. Polish + Onboarding tour       → empty states, notifications, tour
```

Full plan: [`docs/specs/plan-v0.1.0-beta.1.md`](docs/specs/plan-v0.1.0-beta.1.md).

## Stack

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="32" align="right"></a>

- **Nx monorepo** + **pnpm** workspaces
- **Angular 22** with signals, SignalStore, Signal Forms
- **Tailwind v4** + **Spartan NG** (shadcn-for-Angular) primitives
- **Tauri v2** (Rust) for the desktop shell, SQLite for local state
- **Anthropic Claude** as the default agent provider

## Repository layout

```
apps/
  desktop          Angular shell that renders inside Tauri
  desktop-tauri    Rust side: commands, plugins, native shell
  landing          Public marketing site (Analog)
  sandbox          Spartan/Mozart UI playground

libs/
  spartan-ui          ⚠ read-only — Spartan/Hlm primitives
  mozart-ui           editable Mozart components
  mozart-design-tokens / mozart-assets
  desktop-<domain>-*  per-domain feature / ui / data-access / util libs
                      (chat, workspaces, projects, repositories, runs,
                       terminals, auth, onboarding, profile, llm-model,
                       ui-state, shell, core)
  shared-util-*       cross-cutting utilities (theme, os)
  clerk               Clerk integration
```

Every project carries Nx tags across `app:*`, `domain:*`, `type:*`, and
`scope:*` axes. Boundaries are enforced by
`@nx/enforce-module-boundaries` — see [`eslint.config.mjs`](eslint.config.mjs)
and [`CLAUDE.md`](CLAUDE.md) for the rules.

## Getting started

Prerequisites: Node 20+, pnpm 11, Rust toolchain (for Tauri), and the
[Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm dev               # launches the Tauri desktop app
```

## Useful commands

```sh
pnpm dev               # run the desktop app (Tauri + Angular)
pnpm typecheck         # type-check every project
pnpm lint              # ESLint across the workspace
pnpm test              # run all unit/integration tests
pnpm build             # build all buildable projects
pnpm tauri-check       # cargo check the Rust side
pnpm tauri-test        # cargo test the Rust side
pnpm seed              # seed the local SQLite with demo data
pnpm reset-db          # wipe local state
```

Run a single target with Nx directly:

```sh
pnpm nx <target> <project>           # e.g. pnpm nx build desktop
pnpm nx graph                        # interactive project graph
pnpm nx graph --print --affected     # affected projects vs. base
```

## Architecture & conventions

Mozart follows a DDD-style architecture: vertical domain slices, horizontal
layers (`feature-* → ui-* → data → util-*`), facades as the only public
entry to a domain's data layer, and adapters as the only file that talks
to Tauri / IPC / HTTP. See:

- [`docs/specs/mozart-architecture.md`](docs/specs/mozart-architecture.md) — versioned architecture & boundaries
- [`docs/specs/mozart-operating-system-vision.md`](docs/specs/mozart-operating-system-vision.md) — the `.mozart/` project OS vision
- [`docs/specs/plan-v0.1.0-beta.1.md`](docs/specs/plan-v0.1.0-beta.1.md) — the MVP delivery plan and conventions
- [`CLAUDE.md`](CLAUDE.md) — coding rules and constraints for agents
- [`AGENTS.md`](AGENTS.md) — operational map for AI agents working in this repo

**Two ground rules worth knowing up front:**

- `libs/spartan-ui/**` is **read-only**. Domain code composes Spartan/Hlm
  primitives — it never forks them. New primitives are added to
  `libs/spartan-ui` first, then consumed.
- Adapters & DTOs are derived from what the Tauri / Rust side actually
  exposes, never invented in TypeScript. Phase A of every change inventories
  the real command shapes.

## License

MIT
