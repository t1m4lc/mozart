# Mozart — Architecture (1 page)

Mozart wraps Claude Code CLI in an Angular 21 + Tauri v2 desktop shell.
This document is the **1-page orientation** — read it before touching
the codebase. Detailed plans live under `docs/`.

---

## Domain map (`apps/desktop/src/app/`)

```
core/               Cross-domain glue allowed to import Tauri APIs
                    directly. add-project flow, connectivity probe,
                    layout service, notification service, window
                    controls, Tauri-typed bindings.

domains/
├── auth/           /welcome, deep-link handshake, OS keyring session.
├── chat/           Composer wiring, message list, queue/stream.
├── llm-model/      LLM stream parser + reducer (PURE, unit-tested).
├── onboarding/     4-step wizard, /tour, get-started bootstrap.
├── profile/        Connections (Anthropic + GitHub), settings cards.
├── projects/       Project list, add/clone/quick-start dialogs.
├── repositories/   File tree, diff viewer, commit + PR dialogs.
├── runs/           Per-workspace `run_command` lifecycle.
├── tasks/          Per-project task seed (1:1 with workspaces in MVP).
├── terminals/      PTY-backed Terminal tab (xterm.js).
├── ui-state/       Active workspace id + sidebar expand state.
│                   "What is selected / displayed" lives here.
└── workspaces/     Workspace entity collection, branch picker,
                    feature-detail page + store, kanban status.

pages/              Routed shells (dashboard, settings, welcome,
                    onboarding, tour, sandbox).

shell/              AppShell + project list (the only cross-domain
                    composer that imports multiple domain facades).
```

Apps + libs:
- `apps/desktop/` Angular 21 frontend for the desktop app (this tree).
- `apps/desktop-tauri/` Tauri v2 + Rust shell that hosts `apps/desktop`.
- `apps/web/` Angular 21 sign-in / launch handoff (apps.mozart.build).
- `libs/ui/` Spartan NG / Hlm dumb components. **Read-only** during
  desktop feature work.
- `libs/shared-util-theme/` + `libs/mozart-design-tokens/` global theme.

---

## Three load-bearing conventions

### 1. Domains import each other only through `index.ts`

Each `domains/<name>/` exposes a small public surface via its
`index.ts` — a facade + types. Reaching into a sibling's
`data/`, `ui/`, or feature wrappers is a layering violation. The
audit's restricted grep is the enforcement gate (`from '@mozart'`
inside `libs/ui/**` returns zero; `inject(*Store|*ADAPTER` outside
`data/` returns zero).

The only legal cross-domain composer is `shell/` — that's where
sidebar logic meets both `projects` and `workspaces`.

### 2. Stores own entities; ui-state owns "what is selected"

Per Phase 7 conventions §1.3 :

| State kind | Lives in |
|---|---|
| Entity collections (projects, workspaces, chats…) | per-domain `*.store.ts` |
| Currently-active id, sidebar expand state | `domains/ui-state/` |
| Per-component local UI state, draft forms | component-level `signal()` / `linkedSignal()` |
| Imperative side effects (focus, scroll, DOM measurement) | `effect()` |

Facades (`WorkspacesFacade`, `ProjectsFacade`, …) delegate ID concerns
to `UiStateFacade` so historical consumers keep their familiar API.
Every visible `signalStore` declares `withDevtools('storeName')` from
`@angular-architects/ngrx-toolkit` — open Redux DevTools to see
`profile / projects / tasks / workspaces / workspaceDetail / uiState`
streaming patches.

### 3. UI vocabulary is product, not Git

The product speaks **project / task / workspace / thread / agent run /
changes**. The Git implementation underneath uses worktrees, branches,
HEAD, and refs — those words are forbidden in user-facing strings
(labels, dialogs, toasts, tooltips, onboarding copy, settings). Only
logs and dev-only diagnostics may use Git vocabulary. The audit grep
across `apps/desktop/src/app/**/*.html` for
`worktree | HEAD | refs/heads | detached | agent/wip-` is the
anti-regression gate.

Standalone components + signals + zoneless CD + OnPush everywhere are
the Angular 22 stance — historical context in
`docs/archive/conventions/phase-7-refactor-conventions.md`.
