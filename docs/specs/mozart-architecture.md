# Mozart — Architecture & Versioning Plan

This document specifies the architecture of the Mozart desktop app across three
milestones:

- **v0.0.1** — Minimal viable loop (ship in days)
- **v0.1.0** — Guided coding flow (ship in weeks)
- **v1.0.0** — Multi-agent coordination cockpit (ship in months)

The architecture is DDD-style (vertical domain slicing + horizontal layers),
inspired by `angular-architects/flights42`. Each version adds domains and
features on top of the previous one **without restructuring the foundation**.
The v1.0.0 vision drives every v0.0.1 and v0.1.0 decision — early choices are
made so that the future is purely additive.

---

# Strategic Vision

Mozart is a **coordination cockpit for parallel coding agents**, not a chat
client.

The key insight that defines Mozart's positioning:

> Worktrees let agents work in parallel. **Mozart decides how their work
> should combine.**

## What Mozart actually is

The central object is not a chat — it's a **task** that may spawn one or more
**workspaces**, each producing a **candidate solution**, compared in a
**review**, and resolved by a **merge decision**.

```
Plan → Split → Run → Observe → Compare → Review → Merge
```

In v0.0.1 we ship the bottom of the chain (1 workspace, 1 chat, 1 run).
In v0.1.0 we add the guided flow (Mozart Core, skills, context).
In v1.0.0 we ship the full chain (N parallel workspaces per task, review, merge).

## Inspirations and differentiation

| Tool              | What inspires Mozart                                    | What Mozart does differently                                       |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **Conductor**     | parallel agents, isolated workspaces, review-then-merge | open architecture, agent-agnostic, deeper coordination             |
| **Pane**          | agent-agnostic, worktree-as-implementation-detail       | not terminal-first; focuses on decision-making, not just execution |
| **Worktree CLIs** | one agent = one isolated sandbox                        | full UI for comparing and merging multiple solutions               |

The coordination is the product:

- **Pane** decides _where_ agents run
- **Conductor** decides _what_ parallel agents do and how to merge
- **Mozart** decides _what_ agents should do, _how_ to compare their results,
  and _which_ solution deserves trust

## Vocabulary rules (product UI)

Worktree is implementation, workspace is product. Strictly enforced across all
UI text, labels, error messages, and tooltips.

| Always use          | Never use in user-facing copy |
| ------------------- | ----------------------------- |
| workspace           | worktree                      |
| branch (as a badge) | detached HEAD, refs/heads/... |
| run, agent run      | invocation, completion        |
| candidate, solution | branch output, output stream  |
| review              | diff dump, git diff           |
| merge               | merge commit, fast-forward    |

Internal docs, code, and SQL can use the technical vocabulary freely. The UI
layer must translate.

## Filesystem conventions

All git worktrees live under a centralized, user-invisible path:

```
~/.mozart/worktrees/{workspace_id}/
```

Never inside the repo source tree (would force fragile `.gitignore` rules).
Never in `~/dev/...` (incoherent with per-app data directory conventions).
The path is internal — never exposed in commands, URLs, or UI labels.
Defense-in-depth: `sandbox::discard_changes_to(path)` rejects any path that
doesn't descend from this prefix.

---

# Anticipating future versions

The architecture intentionally over-prepares v0.0.1 in five places to make
v0.1.0 and v1.0.0 purely additive migrations. These are the decisions that
prevent breaking changes later.

## 1. Task entity exists from v0.0.1 (invisible)

In v0.0.1 the relationship is `1 Task = 1 Workspace = 1 Chat = N Runs`.

The user only sees Workspaces. But the `tasks` table and a minimal `tasks/`
domain (data layer only) are in place. This unlocks:

- **v0.1.0**: Mozart Core auto-creates Tasks for task detection and next-step
  suggestions, still invisible
- **v1.0.0**: a single Task can spawn N Workspaces (parallel candidates),
  without any schema or URL change

## 2. URL structure stable across all versions

| Route               | Since      | Purpose                                 |
| ------------------- | ---------- | --------------------------------------- |
| `/workspaces/:id`   | v0.0.1     | Workspace view (chat + diff + terminal) |
| `/settings/*`       | v0.0.1     | Settings shell                          |
| `/tasks`            | **v1.0.0** | Task list                               |
| `/tasks/:id`        | **v1.0.0** | Task detail with N workspaces           |
| `/tasks/:id/review` | **v1.0.0** | Compare candidates                      |

The `/workspaces/:id` URL stays stable forever. Adding `/tasks/:id` later is
purely additive.

## 3. Chat 1:1 with Workspace in v0.0.1, relaxes to 1:N in v0.1.0

In v0.0.1, the `threads` table has an implicit unicity per workspace (1 chat
per workspace). The frontend reflects this with
`chat.facade.loadForWorkspace(id)`.

In v0.1.0 the unicity is relaxed in SQL (no schema migration — just remove a
constraint). The frontend adds tabs in the workspace view. The facade
signature stays the same; it just starts returning `Chat[]` instead of a
single `Chat`.

## 4. Worktree path convention locked

`~/.mozart/worktrees/{workspace_id}/` is the path from day one. No code ever
reads or writes worktrees outside this prefix. When the path strategy changes
later (e.g. cloud worktrees), only the adapter changes — no UI churn.

## 5. Vocabulary translation centralized

All worktree-aware code goes through `workspaces/data/worktree.adapter.ts`.
The UI never sees `worktree_path` or git plumbing. The adapter is the only
file that knows about git internals.

---

## Conventions used throughout

### Flattening rule

**If a folder would contain a single file, flatten it.**

```diff
- ui-file-tree/
-   └── file-tree.ts
+ ui-file-tree.ts
```

Folders are kept when they group multiple related files:

- `data/` — always (model + store + facade + adapters)
- `feature-<x>/` — when the feature has sub-components
- `util-<x>/` — when there are multiple helpers + tests

### Component template

Every Angular component file follows this pattern:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-<kebab-case>',
  template: `<!-- TODO -->`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class <PascalCase> {}
```

Conventions:

- Selector prefix: `app-` (Angular CLI default)
- Class name: no `Component` suffix (Angular 20+ style)
- Inline templates by default; extract to `.html` only when >40 lines
- `OnPush` always
- Standalone components only — no NgModules
- Route params injected via `input()` signals
  (enabled by `withComponentInputBinding()`)

### Layer rules (DDD)

Inside any domain `<X>`:

```
feature-*    → may use ui-*, data, util-*
ui-*         → may use data, util-*
data         → may use util-*
util-*       → no internal dependencies
```

Cross-domain rule: **a domain only imports from itself and `shared`.** The
`shell/` and `pages/` layers are the only places allowed to compose multiple
domains.

### Path mapping

In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@mozart/*": ["apps/desktop/src/app/domains/*"]
    }
  }
}
```

Imports across domains use `import { … } from '@mozart/<domain>';`.

### Why navigate by workspaces, not tasks?

Tasks are the **user's intention**. Workspaces are **where execution
happens**. In v0.0.1 and v0.1.0 the relationship is 1:1 so navigation by
workspaces feels natural. In v1.0.0 a task may spawn N workspaces, so tasks
get their own URL space — without disturbing the workspace URLs.

| Concept       | What it is                                                | User-facing?                       | URL?                    |
| ------------- | --------------------------------------------------------- | ---------------------------------- | ----------------------- |
| **Project**   | Local repo + Mozart config                                | Always                             | `/projects/...` (later) |
| **Task**      | Work intention (may spawn N workspaces in v1.0.0)         | **v1.0.0 only**                    | `/tasks/:id` in v1.0.0  |
| **Workspace** | Execution sandbox (git worktree + branch + chat)          | Always                             | `/workspaces/:id`       |
| **Candidate** | A workspace's solution viewed from the task's perspective | **v1.0.0 only**                    | derived view            |
| **Chat**      | Conversation inside a workspace                           | Always (1 in v0.0.1, N in v0.1.0+) | tab inside workspace    |

---

# V0.0.1 — Minimal Viable Loop

## Scope

The smallest possible app that proves the core hypothesis: a developer can
open a project, create an isolated git workspace, ask the LLM a question
about their code, and watch the streaming response arrive.

### In scope

- Add a project (point at an existing local folder)
- Create a workspace (git worktree at `~/.mozart/worktrees/{id}/` + branch)
- One chat per workspace
- Plain textarea composer (Enter to send, Shift+Enter for newline)
- Streaming LLM response (Anthropic API via existing Tauri adapter)
- Settings page with connection status (Claude connected ✓ / not connected)
- 3-column layout: left sidebar + center content + right aside
  (aside is **empty structure only**, ready for CSS work)
- Internal Task entity (1:1 with Workspace, not exposed in UI)
- Persisted state via Tauri / local SQLite

### Out of scope (deferred)

- Slash commands / skills
- @ mentions / context attachments / @web
- # references
- Multi-tab chats per workspace
- Tool calls / MCP
- Auto-workspace flow / next-step suggestions
- Review panel, file tree, terminal panel (aside stays empty)
- Multi-provider, model routing, effort selector
- Project templates
- GitHub / Linear / PostHog integrations
- **Parallel candidates** (deferred to v1.0.0)
- **Multi-workspace task** (deferred to v1.0.0)
- Sheriff lint enforcement (added in v0.1.0)

## Domains

Seven folders. The `tasks` folder is a thin anticipation of v1.0.0 — data
layer only, no UI.

| Domain       | Responsibility                                              |
| ------------ | ----------------------------------------------------------- |
| `projects`   | Add/list projects, sidebar navigation                       |
| `tasks`      | **Internal Task entity (1:1 with Workspace, hidden in UI)** |
| `workspaces` | Create/list workspaces, git worktree adapter                |
| `chat`       | One chat per workspace, composer, streaming messages        |
| `llm-model`  | Adapter over the existing Tauri LLM bridge                  |
| `profile`    | Connection status (Claude, later GitHub), basic settings    |
| `shared`     | UI primitives, shared types                                 |

No `core`, no `skills`, no `context`, no `mcp`, no `project-templates`, no
`integrations`, no `agent-runs`, no `repositories`, no `candidates`, no
`reviews`, no `merge`.

## Layout

3 columns. Right aside is empty structure, ready for CSS.

```
┌────────────────────────────────────────────────────────────────────┐
│ AppShell                                                            │
│ ┌──────────┬─────────────────────────────────────┬───────────────┐ │
│ │ Sidebar  │ Content (router-outlet)             │ Aside (empty) │ │
│ │          │                                     │               │ │
│ │ projects │ workspace.page                      │ (placeholder) │ │
│ │ ws list  │   ↳ message-list   (chat/)          │               │ │
│ │ + add    │   ↳ composer       (chat/)          │               │ │
│ └──────────┴─────────────────────────────────────┴───────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## File structure

```
apps/desktop/src/app/
├── main.ts
├── app.config.ts
├── app.routes.ts
│
├── shell/
│   ├── app-shell.ts
│   ├── shell-sidebar.ts
│   ├── shell-content.ts
│   └── shell-aside.ts                  ← empty structure for v0.0.1
│
├── pages/
│   ├── workspace.page.ts
│   └── settings.page.ts
│
└── domains/
    ├── projects/
    │   ├── feature-project-list.ts
    │   ├── feature-add-project.ts
    │   ├── ui-project-card.ts
    │   ├── data/
    │   │   ├── project.model.ts
    │   │   ├── project.store.ts
    │   │   └── project.facade.ts
    │   └── index.ts
    │
    ├── tasks/                          ← NEW : anticipation v1.0.0, data only
    │   ├── data/
    │   │   ├── task.model.ts
    │   │   └── task.store.ts
    │   └── index.ts
    │
    ├── workspaces/
    │   ├── feature-workspace-list.ts
    │   ├── feature-create-workspace.ts
    │   ├── ui-workspace-list-item.ts
    │   ├── data/
    │   │   ├── workspace.model.ts      ← has taskId field
    │   │   ├── workspace.store.ts
    │   │   ├── workspace.facade.ts     ← creates Task + Workspace together
    │   │   └── worktree.adapter.ts     ← ONLY file that knows worktree paths
    │   ├── util-workspace-name.ts
    │   └── index.ts
    │
    ├── chat/
    │   ├── feature-chat-panel.ts
    │   ├── feature-composer.ts
    │   ├── ui-message-list.ts
    │   ├── ui-user-message.ts
    │   ├── ui-agent-message.ts
    │   ├── data/
    │   │   ├── chat.model.ts
    │   │   ├── message.model.ts
    │   │   ├── chat.store.ts
    │   │   └── chat.facade.ts
    │   └── index.ts
    │
    ├── llm-model/
    │   ├── data/
    │   │   ├── llm.adapter.ts          ← interface only, Tauri impl injected
    │   │   ├── provider.model.ts
    │   │   └── providers.store.ts
    │   └── index.ts
    │
    ├── profile/
    │   ├── feature-connections.ts
    │   ├── ui-connection-card.ts
    │   ├── data/
    │   │   ├── profile.model.ts
    │   │   ├── connection.model.ts
    │   │   └── profile.store.ts
    │   └── index.ts
    │
    └── shared/
        ├── ui-button.ts
        ├── ui-icon.ts
        ├── data/
        │   ├── result.ts
        │   └── id.ts
        └── util-date.ts
```

About 38 files. Flatten rule applied throughout.

## Routes

```ts
// app.routes.ts
import { Routes } from '@angular/router';
import { AppShell } from './shell/app-shell';

export const appRoutes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'workspaces' },
      {
        path: 'workspaces',
        loadComponent: () =>
          import('./pages/workspace.page').then(m => m.WorkspacePage),
      },
      {
        path: 'workspaces/:id',
        loadComponent: () =>
          import('./pages/workspace.page').then(m => m.WorkspacePage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings.page').then(m => m.SettingsPage),
      },
    ],
  },
];
```

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes, withComponentInputBinding()),
  ],
};
```

## Key composition examples

### AppShell — 3-column layout

```ts
// shell/app-shell.ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ShellSidebar } from './shell-sidebar';
import { ShellAside } from './shell-aside';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, ShellSidebar, ShellAside],
  template: `
    <div class="shell-grid">
      <app-shell-sidebar class="col-sidebar" />
      <main class="col-content">
        <router-outlet />
      </main>
      <app-shell-aside class="col-aside" />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {}
```

### Workspace creation — Task + Workspace together

```ts
// domains/workspaces/data/workspace.facade.ts
import { Injectable, inject } from '@angular/core';
import { WorkspaceStore } from './workspace.store';
import { TaskStore } from '@mozart/tasks';
import { WORKTREE_ADAPTER } from './worktree.adapter';
import { generateWorkspaceName } from '../util-workspace-name';

@Injectable({ providedIn: 'root' })
export class WorkspaceFacade {
  private readonly store = inject(WorkspaceStore);
  private readonly tasks = inject(TaskStore);
  private readonly worktree = inject(WORKTREE_ADAPTER);

  /**
   * Creates a Task + Workspace pair. In v0.0.1 this is 1:1.
   * In v1.0.0, a Task can spawn N Workspaces via the same flow.
   */
  async createForPrompt(input: { projectId: string; prompt: string }) {
    const task = await this.tasks.create({
      projectId: input.projectId,
      title: input.prompt,
    });
    const name = generateWorkspaceName(this.store.takenNames());
    const branch = `mozart/${name}`;
    // worktree path is INTERNAL — never returned or exposed
    await this.worktree.create({ branch, workspaceName: name });
    return this.store.add({ taskId: task.id, name, branch });
  }
}
```

The facade creates Task + Workspace atomically. In v0.0.1 every Task has
exactly one Workspace. The pattern doesn't change in v1.0.0 — the facade just
gets a `createSecondCandidate(taskId)` method that adds another Workspace to
an existing Task.

### LLM adapter — thin interface over Tauri

```ts
// domains/llm-model/data/llm.adapter.ts
import { InjectionToken } from '@angular/core';

export interface LlmAdapter {
  /** Stream an assistant response as it's generated. */
  stream(messages: Array<{ role: 'user' | 'assistant'; content: string }>):
    AsyncIterable<string>;
}

export const LLM_ADAPTER = new InjectionToken<LlmAdapter>('LLM_ADAPTER');
```

The Tauri-backed implementation is provided in `app.config.ts`. The agent
working on the codebase analyzes the existing Tauri command setup and wires
the concrete impl — the frontend doesn't care how streaming is plumbed.

### Worktree adapter — the only file that knows worktree paths

```ts
// domains/workspaces/data/worktree.adapter.ts
import { InjectionToken } from '@angular/core';

export interface WorktreeAdapter {
  /** Creates a worktree under ~/.mozart/worktrees/{workspaceId}/ */
  create(input: { branch: string; workspaceName: string }): Promise<void>;
  /** Removes the worktree (used on archive) */
  remove(workspaceId: string): Promise<void>;
}

export const WORKTREE_ADAPTER = new InjectionToken<WorktreeAdapter>('WORKTREE_ADAPTER');
```

No other file in the app references `worktree_path` or git plumbing.

## Scaffolding prompt for v0.0.1

Paste this into Claude Code at the repo root to generate the empty scaffold:

````
Scaffold Mozart v0.0.1 as an Angular 20 standalone components project
inside `apps/desktop/src/app/`.

Conventions for every component file:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-<kebab-of-filename>',
  template: `<!-- TODO: <ComponentName> -->`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class <PascalName> {}
```

For `.store.ts` use NgRx signalStore:
```ts
import { signalStore, withState } from '@ngrx/signals';
export const <PascalName> = signalStore(
  { providedIn: 'root' },
  withState({}),
);
```

For `.model.ts`:
```ts
export type <PascalName> = { id: string };
```

For `.facade.ts`:
```ts
import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class <PascalName> {}
```

For `.adapter.ts`:
```ts
import { InjectionToken } from '@angular/core';
export interface <PascalName> {}
export const <UPPER_SNAKE> = new InjectionToken<<PascalName>>('<PascalName>');
```

Set up `app.config.ts` with:
```ts
provideRouter(appRoutes, withComponentInputBinding())
```

Each domain folder gets an `index.ts` re-exporting its public features, ui
components, and facade (NOT internal stores or adapters).

Path mapping in tsconfig.json:
```json
"paths": { "@mozart/*": ["apps/desktop/src/app/domains/*"] }
```

Files to create:

apps/desktop/src/app/main.ts
apps/desktop/src/app/app.config.ts
apps/desktop/src/app/app.routes.ts

apps/desktop/src/app/shell/app-shell.ts
apps/desktop/src/app/shell/shell-sidebar.ts
apps/desktop/src/app/shell/shell-content.ts
apps/desktop/src/app/shell/shell-aside.ts

apps/desktop/src/app/pages/workspace.page.ts
apps/desktop/src/app/pages/settings.page.ts

apps/desktop/src/app/domains/projects/feature-project-list.ts
apps/desktop/src/app/domains/projects/feature-add-project.ts
apps/desktop/src/app/domains/projects/ui-project-card.ts
apps/desktop/src/app/domains/projects/data/project.model.ts
apps/desktop/src/app/domains/projects/data/project.store.ts
apps/desktop/src/app/domains/projects/data/project.facade.ts
apps/desktop/src/app/domains/projects/index.ts

apps/desktop/src/app/domains/tasks/data/task.model.ts
apps/desktop/src/app/domains/tasks/data/task.store.ts
apps/desktop/src/app/domains/tasks/index.ts

apps/desktop/src/app/domains/workspaces/feature-workspace-list.ts
apps/desktop/src/app/domains/workspaces/feature-create-workspace.ts
apps/desktop/src/app/domains/workspaces/ui-workspace-list-item.ts
apps/desktop/src/app/domains/workspaces/data/workspace.model.ts
apps/desktop/src/app/domains/workspaces/data/workspace.store.ts
apps/desktop/src/app/domains/workspaces/data/workspace.facade.ts
apps/desktop/src/app/domains/workspaces/data/worktree.adapter.ts
apps/desktop/src/app/domains/workspaces/util-workspace-name.ts
apps/desktop/src/app/domains/workspaces/index.ts

apps/desktop/src/app/domains/chat/feature-chat-panel.ts
apps/desktop/src/app/domains/chat/feature-composer.ts
apps/desktop/src/app/domains/chat/ui-message-list.ts
apps/desktop/src/app/domains/chat/ui-user-message.ts
apps/desktop/src/app/domains/chat/ui-agent-message.ts
apps/desktop/src/app/domains/chat/data/chat.model.ts
apps/desktop/src/app/domains/chat/data/message.model.ts
apps/desktop/src/app/domains/chat/data/chat.store.ts
apps/desktop/src/app/domains/chat/data/chat.facade.ts
apps/desktop/src/app/domains/chat/index.ts

apps/desktop/src/app/domains/llm-model/data/llm.adapter.ts
apps/desktop/src/app/domains/llm-model/data/provider.model.ts
apps/desktop/src/app/domains/llm-model/data/providers.store.ts
apps/desktop/src/app/domains/llm-model/index.ts

apps/desktop/src/app/domains/profile/feature-connections.ts
apps/desktop/src/app/domains/profile/ui-connection-card.ts
apps/desktop/src/app/domains/profile/data/profile.model.ts
apps/desktop/src/app/domains/profile/data/connection.model.ts
apps/desktop/src/app/domains/profile/data/profile.store.ts
apps/desktop/src/app/domains/profile/index.ts

apps/desktop/src/app/domains/shared/ui-button.ts
apps/desktop/src/app/domains/shared/ui-icon.ts
apps/desktop/src/app/domains/shared/data/result.ts
apps/desktop/src/app/domains/shared/data/id.ts
apps/desktop/src/app/domains/shared/util-date.ts

CRITICAL constraints to bake in from day one:
- The `worktree.adapter.ts` is the ONLY file that may reference worktree
  paths. All paths live under `~/.mozart/worktrees/{workspaceId}/`.
- UI labels and templates NEVER use the word "worktree". Use "workspace",
  "branch", "run", "candidate", "review", "merge" instead.
- The `WorkspaceFacade.createForPrompt(...)` creates a Task AND a Workspace
  together. Tasks are 1:1 with workspaces in v0.0.1 but the schema is ready
  for 1:N in v1.0.0.

For the `llm.adapter.ts`, analyze the existing Tauri code in the codebase
and wire a concrete implementation in `app.config.ts` that provides
LLM_ADAPTER. Do NOT write the streaming logic from scratch — reuse the
existing Tauri commands.

Beyond that, do not add any logic, no inter-file imports, no real route
wiring beyond empty shells. Goal: a buildable scaffold of empty components
plus the working LLM adapter.
````

---

# V0.1.0 — Guided Coding Flow

## Scope additions

Everything from v0.0.1, plus:

- **Mozart Core Plugin** — auto-workspace flow, task detection, next-step
  suggestions, hash reference resolver
- **Skills domain** — `/plan`, `/implement`, `/review`, `/fix`, `/commit`
  built-in skills, slash command picker
- **Context domain** — `@` mentions for files, folders, symbols, current diff,
  terminal output, previous plan; context chips in composer
- **Agent runs domain** — tool calls, run status, run timeline, streaming
  events
- **Repositories domain** — file tree, diff viewer, review panel, checks
  list, Git identity settings
- **Workspaces extensions** — terminal panel, multiple workspaces per project,
  workspace tabs, populated aside (review / terminal / context tabs)
- **Chat extensions** — multiple chats per workspace (threads table unicity
  relaxed), message types (user / agent / tool-call / status / error)
- **LLM model** — multiple providers (Anthropic + OpenAI + OpenRouter + Local),
  model selector, effort selector, simple routing per-skill
- **MCP domain** — basic server registration (global scope), tool inspection
- **Project templates domain** — Blank, Existing Repository, GStack Workflow,
  Angular + Spartan UI
- **Integrations domain** — GitHub PR creation and status (surfaces in
  profile as a new connection card)
- **Profile extensions** — full settings shell with 9 tabs, settings
  inheritance resolver
- **Composer command center** — `/` skills, `@` context, `@web` (basic),
  `#` references
- **Sheriff** — added with strict layer + domain access rules

Note: tasks remain **internal** in v0.1.0. Mozart Core auto-creates them, but
they're not shown to the user. The 1:N task→workspace expansion is v1.0.0.

## Settings shell (detailed structure)

The settings page has its own mini-shell with a left sidebar and main pane.
Entry point: small gear icon at the bottom of the main sidebar.

### Sidebar items (with icons)

```
← Back to app

1. General
2. Models
3. Providers
4. Appearance
5. Git
6. Account

[ More ]
7. Experimental
8. Advanced

[ Repositories ]
9. Quickstart
```

### Page content overview

| Page                                | Contains                                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **General**                         | Send-message shortcut, follow-up behavior, desktop notifications, completion sound, auto-convert long text, strip "You're absolutely right!", always show context usage, caffeinate while running, MCP status in chat, don't collapse tool calls |
| **Models**                          | Default model, default effort, review model + effort, Codex personality, default to plan mode, default to fast mode, browser control toggle                                                                                                      |
| **Providers**                       | Per-provider API key config (Claude Code, Codex), environment variables, CLI auth status                                                                                                                                                         |
| **Appearance**                      | Theme (light/dark/system), colored sidebar diffs, accessible colors, code theme, mono font, code ligatures, markdown style, terminal font + size                                                                                                 |
| **Git**                             | Branch prefix, GitHub username, custom prefix, delete branch on archive, archive on merge                                                                                                                                                        |
| **Account**                         | User profile, Linear integration, GitHub CLI integration, personal access token, enterprise data privacy, Claude Code tool approvals, sign out                                                                                                   |
| **Experimental**                    | Big terminal mode, dashboard toggle, voice mode, automerge, spotlight testing, sidebar resource usage, branch-name directory match, Graphite stack, React profiler                                                                               |
| **Advanced**                        | Mozart root directory, Claude Code executable path, Codex executable path, SSH private key path                                                                                                                                                  |
| **Quickstart** (Repositories scope) | Per-repo: root path, workspaces path, base branch, remote origin, preview URL, files to copy, setup/run/archive scripts, AI preferences                                                                                                          |

Each page lives in its owning domain:

| Page         | Owning domain                |
| ------------ | ---------------------------- |
| General      | `profile`                    |
| Models       | `llm-model`                  |
| Providers    | `llm-model` + `integrations` |
| Appearance   | `profile`                    |
| Git          | `repositories`               |
| Account      | `profile` + `integrations`   |
| Experimental | `core`                       |
| Advanced     | `profile`                    |
| Quickstart   | `repositories`               |

The `SettingsShell` lives in `shell/settings-shell/` and composes pages from
multiple domains via its sub-router.

## Domains overview

14 domains + shell + pages + shared.

```
domains/
├── projects/
├── tasks/              (still data-only, Mozart Core consumes it)
├── workspaces/         (worktree, branch, snapshot, ws list, header, tabs)
├── chat/               (multi-chat, composer host, message types)
├── agent-runs/         (run lifecycle, tool calls, streaming events)
├── skills/             (registry, slash menu, metadata)
├── context/            (@ menu, @web basic, context chips, context panel)
├── llm-model/          (providers, model resolver, model & effort selectors)
├── mcp/                (basic global servers)
├── repositories/       (file tree, diff, review panel, git identity, quickstart)
├── project-templates/  (4 built-in templates)
├── integrations/       (GitHub PR; surfaces via profile/connections)
├── profile/            (settings shell + tabs, connections, settings resolver)
├── core/               (Mozart Core: auto-ws, task detect, suggestions,
│                        built-in skills source, hash reference resolver)
└── shared/
```

## Sheriff config for v0.1.0

```ts
export const sheriffConfig: SheriffConfig = {
  version: 1,
  enableBarrelLess: true,
  tagging: {
    'src/app': {
      'shell':   ['scope:shell'],
      'pages':   ['scope:pages'],
      'domains/<domain>': {
        'feature-<feature>': ['domain:<domain>', 'type:feature'],
        'ui-<ui>':           ['domain:<domain>', 'type:ui'],
        'data':              ['domain:<domain>', 'type:data'],
        'util-<util>':       ['domain:<domain>', 'type:util'],
      },
    },
  },
  modules: {
    root: ['*'],
    'scope:shell': ['domain:*', 'scope:pages'],
    'scope:pages': ['domain:*'],
    'domain:*':    [sameTag, 'domain:shared'],
    'type:feature': ['type:ui', 'type:data', 'type:util'],
    'type:ui':      ['type:data', 'type:util'],
    'type:data':    ['type:util'],
    'type:util':    noDependencies,
  },
};
```

No cross-domain exceptions. Every cross-domain composition goes through
`shell/` or `pages/`.

## Migration v0.0.1 → v0.1.0

The v0.0.1 structure is **forward compatible**. Migration is purely additive:

1. **Promote single-file folders back to folders** when adding sub-components
2. **Add new domains** as siblings under `domains/`
3. **Add `pages/home.page.ts`** (recent projects + workspaces)
4. **Populate `ShellAside`** with the tabs panel
5. **Wire Sheriff** with the v0.1.0 config above
6. **Build the SettingsShell** in `shell/settings-shell/` aggregating settings
   pages from multiple domains
7. **Relax `threads` table unicity** to allow N chats per workspace

No file from v0.0.1 needs to move or be renamed.

---

# V1.0.0 — Multi-Agent Coordination Cockpit

This is the version that delivers the strategic vision: **Mozart as a
coordination layer**, not just an enhanced chat.

## Scope additions

Everything from v0.1.0, plus the full coordination chain.

### Tasks become user-facing

A task can now spawn N workspaces in parallel. Tasks get their own URL:

```
/tasks                 → task list
/tasks/:id             → task detail with N workspace cards
/tasks/:id/review      → cross-candidate review
/tasks/:id/merge       → merge decision view
```

The `tasks/` domain is promoted from data-only to a full domain with
features and UI.

### Candidate solutions

A workspace, viewed from the parent task's perspective, becomes a
**candidate**. New domain `candidates/`:

- Candidate comparison views (grid of workspace cards under a task)
- Per-candidate auto-summary (files changed, diff size, risks, tests,
  confidence)
- Ranking and recommendation logic
- Conflict detection between candidates

### Review

Transforms raw agent outputs into a legible decision. New domain `reviews/`:

- Side-by-side diff comparison across candidates
- Per-file change classification (additive / refactor / breaking)
- Risk assessment
- Test coverage delta
- Recommendation: merge A, merge B, combine, ask revision, archive

### Merge decision

The final user action. New domain `merge/`:

- Merge a candidate to base branch
- Create PR via GitHub integration
- Combine multiple candidates (cherry-pick + conflict resolution)
- Archive without merging
- Send back for revision with feedback

### Role-based agents

Beyond builders, Mozart can spawn role-specific agents:

- **Planner** — decomposes the task into sub-tasks
- **Builder** — implements (one or many in parallel = candidates)
- **Tester** — verifies / writes tests
- **Reviewer** — critiques diffs
- **Designer** — verifies UX/UI
- **DX Reviewer** — maintainability and readability

This is the bridge between parallel execution and true swarm coordination.

Flow:

```
User Task
  → Planner (1 workspace)
  → Builder Workspaces (N parallel)
  → Tester Workspace (1 per candidate)
  → Reviewer (cross-candidate)
  → Merge Decision
```

### Plugin marketplace

- External plugin manifest (MCP definitions, project templates, integrations,
  routing rules, hooks, commands, optional capabilities)
- Plugin permissions model
- Plugin discovery + installation UI
- Plugin versioning and updates

### Advanced model routing

Routing rules with conditions: skill, context size, task type, risk, cost,
latency, provider availability. Per-project and per-skill overrides.
Resolved-model preview with reasoning.

### Web Context Plugin

Full `@web` URL fetching with HTML-to-Markdown conversion, caching policy,
robots.txt + private IP blocking, URL allowlist/blocklist, preview before
attaching.

### Skills marketplace

User-created skills, project-scoped skills (`.mozart/skills/`), community
skills via plugins.

### Business templates

HR Assistant, Recruiting Pipeline, Administrative Workspace, Sales Outreach
Workspace, Customer Support Workspace. Mozart extends beyond pure coding.

### Additional integrations

Linear (full task linking), Supabase (RLS audit), PostHog (analytics).

### Advanced MCP UI

Per-tool enable/disable, connection testing, schema inspection, logs.

## Domains added or promoted in v1.0.0

```
domains/
├── … (everything from v0.1.0) …
│
├── tasks/              ← PROMOTED from data-only to full domain
│   ├── feature-task-list/
│   ├── feature-task-detail/
│   ├── feature-task-graph/      (subtasks + dependencies)
│   ├── ui-task-card/
│   └── data/
│
├── candidates/         ← NEW
│   ├── feature-candidate-grid/  (workspaces as candidates under a task)
│   ├── feature-candidate-summary/
│   ├── ui-candidate-card/
│   ├── ui-confidence-badge/
│   └── data/
│       ├── candidate.model.ts   (a view over Workspace from task lens)
│       ├── candidate.facade.ts
│       └── candidate-ranker.service.ts
│
├── reviews/            ← NEW
│   ├── feature-review-page/     (side-by-side comparison)
│   ├── feature-conflict-detector/
│   ├── ui-cross-diff/
│   ├── ui-risk-summary/
│   └── data/
│
├── merge/              ← NEW
│   ├── feature-merge-decision/
│   ├── feature-pr-create/
│   ├── feature-combine-candidates/
│   ├── ui-merge-action/
│   └── data/
│
├── orchestration/      ← NEW (replaces parts of core)
│   ├── feature-planner/
│   ├── feature-role-assignment/
│   ├── feature-run-coordinator/
│   └── data/
│
└── plugins/            ← NEW
    ├── feature-plugin-marketplace/
    ├── feature-plugin-detail/
    ├── feature-plugin-permissions/
    ├── ui-plugin-card/
    └── data/
```

`context/` and `mcp/` get major extensions but stay as the same domain.

## Pages in v1.0.0

```
pages/
├── home.page.ts                  (from v0.1.0)
├── workspace.page.ts             (unchanged since v0.0.1)
├── task.page.ts                  ← NEW : /tasks/:id
├── task-review.page.ts           ← NEW : /tasks/:id/review
├── task-merge.page.ts            ← NEW : /tasks/:id/merge
├── quickstart.page.ts            (from v0.1.0)
├── create-project.page.ts        (from v0.1.0)
└── plugin-marketplace.page.ts    ← NEW : /plugins
```

## Routes in v1.0.0

```
/                      → redirect to /workspaces
/workspaces            → workspace list
/workspaces/:id        → workspace page (unchanged since v0.0.1)
/tasks                 → NEW: task list
/tasks/:id             → NEW: task detail with N workspace cards
/tasks/:id/review      → NEW: cross-candidate review
/tasks/:id/merge       → NEW: merge decision
/settings              → settings shell
/plugins               → NEW: plugin marketplace
```

The `/workspaces/:id` URL has been stable since v0.0.1. Tasks get their own
URL space only when they become user-facing.

## Migration v0.1.0 → v1.0.0

Mostly additive. Three real refactors:

1. **Promote `tasks/`** from data-only to a full domain. Add features, UI,
   and the `/tasks/*` routes.
2. **Add `candidates/`, `reviews/`, `merge/`, `orchestration/`, `plugins/`**
   as new sibling domains.
3. **Relax the 1:1 Task↔Workspace constraint** in the SQL (and in
   `WorkspaceFacade.createForPrompt` — add a `createCandidate(taskId)`
   sibling method). The existing 1:1 flow keeps working; the new 1:N flow
   is opt-in.

No URL change. No data loss. No file moves.

## Task statuses (canonical)

```
created → planning → running → reviewing → ready_to_merge → merged
                                         ↓
                                      archived | failed
```

## Workspace statuses (canonical)

```
created → running → waiting_for_input → changed → done → merged
                                                    ↓
                                                 failed | archived
```

## Agent statuses (canonical)

```
idle → starting → running → waiting → completed
                                    ↓
                                 failed | stopped
```

---

# Appendix A — Decision log

## Why `llm-model` and not `models` or `model`

Avoids collision with "model" as in domain model (DDD term) and "model" as in
data model. `llm-model` is unambiguous: this domain owns LLM-related
configuration only.

## Why `chat` and not `threads`

User-facing word, simpler, shorter. The entity is just `Chat`. Multi-chat
support in v0.1.0 reads naturally as `Chat[]`. "Thread" implies tree-shaped
conversations which Mozart doesn't have.

## Why `core` and not `orchestration` or `workflow`

In v0.1.0 the Mozart Core Plugin owns the guided coding flow — naming it
"core" matches the product spec. In v1.0.0, `orchestration` is a separate
domain focused on multi-agent role assignment and run coordination — it's a
new concept and earns a new name.

## Why workspaces drive navigation, not tasks (until v1.0.0)

Workspaces are where execution happens. Tasks are work intentions, useful
for the orchestrator but transparent to the user in v0.0.1 and v0.1.0. URL
navigation follows the user's mental model: "I'm working in this workspace."
When tasks become first-class in v1.0.0 (1 task → N workspaces), they get
their own URL space — but the workspace URL stays stable.

## Why a tiny `tasks/` domain in v0.0.1 instead of folding into `workspaces/`

The SQL schema already has a `tasks` table. The table is the integration
contract between v0.0.1 SQL and v1.0.0 features. Having a thin `tasks/`
domain with `data/` only:

- Mirrors the SQL → less mental gymnastics
- Means v1.0.0 promotion is purely additive (add features, no file moves)
- Makes the 1:1 → 1:N evolution explicit in the codebase: the facade
  signature changes from `createForPrompt(prompt)` to also expose
  `createCandidate(taskId)`

The cost is minimal (one folder, 3 files, no UI), and the future migration
becomes trivial.

## Why `~/.mozart/worktrees/{workspaceId}/` and not in-repo

In-repo worktrees pollute the source tree and require fragile `.gitignore`
rules. A user-data centralized path is consistent with the conventions used
by Conductor (`~/Library/Application Support/com.conductor.app`) and Pane.
The path is internal — never exposed in UI, URLs, or commands. The
`worktree.adapter.ts` is the single chokepoint enforcing this.

## Why vocabulary translation is mandatory

The risk of leaking "worktree" or "branch" or "HEAD" into the UI is high —
every contributor instinctively reaches for git vocabulary. By centralizing
worktree handling in one adapter and forbidding the word everywhere else,
the product vocabulary stays stable as the implementation evolves (cloud
worktrees, snapshot-based candidates, etc.).

## Why no raw API key in the profile UI

API keys are an implementation detail. Users think in terms of "I'm
connected to Claude" and "I'm connected to GitHub." The Connections pattern
surfaces this mental model and is extensible — each new integration adds a
card. In v0.0.1 the Connect button opens a paste-key dialog; later it can
become OAuth.

## Why `pages/` and not `views/` or `routes/`

Matches Angular community convention. "Pages" implies route-level
composition. "Views" is overloaded. "Routes" is the config, not the
components.

## Why composer lives in `chat/`, not its own domain

The composer is the entry point for messages. Messages are in `chat`. In
v0.1.0 the composer consumes sub-components from `skills` (slash menu) and
`context` (mention menu), but the composer itself belongs to the chat
experience.

## Why `app-` selector prefix

Angular CLI default. No custom naming overhead, works out of the box with
generators, reads cleanly.

## Why `candidates/`, `reviews/`, `merge/` are separate domains in v1.0.0

Each represents a distinct user activity and has its own UI surface,
business rules, and lifecycle:

- `candidates/` answers "which solutions does this task have?"
- `reviews/` answers "how do they compare?"
- `merge/` answers "what do I do with the result?"

Folding them into `tasks/` would create a megadomain. Folding them into
`workspaces/` would conflate execution and decision-making.

---

# Appendix B — File naming cheat sheet

| Filename           | Purpose                                     | Inside                |
| ------------------ | ------------------------------------------- | --------------------- |
| `*.ts` (component) | Angular standalone component                | feature-_ / ui-_      |
| `*.page.ts`        | Route-level component                       | pages/                |
| `*.service.ts`     | Injectable service                          | data/                 |
| `*.store.ts`       | NgRx signalStore                            | data/                 |
| `*.facade.ts`      | Public API to the domain's state            | data/                 |
| `*.model.ts`       | Type definitions                            | data/                 |
| `*.adapter.ts`     | Interface + InjectionToken for IPC/external | data/                 |
| `*.routes.ts`      | Angular Routes array                        | shell/ or domain root |
| `*.directive.ts`   | Angular directive                           | feature-\* or shared/ |
| `*.spec.ts`        | Test file                                   | colocated             |
| `index.ts`         | Public API re-export                        | domain root           |

---

# Appendix C — Strategic summary

**Mozart v0.0.1**:
Minimal loop — ship the core hypothesis (project + workspace + chat + stream).
Anticipate the future by keeping Task in the schema, worktree paths
centralized, and UI vocabulary clean.

**Mozart v0.1.0**:
Guided flow — Mozart Core orchestrates the user's intent through skills,
context, and a populated aside. Settings get a proper shell. Tasks still
internal.

**Mozart v1.0.0**:
Coordination cockpit — tasks become first-class, spawn parallel candidates,
compared in a review, resolved by a merge decision. Plugins, role-based
agents, business templates. This is the strategic destination.

Across all three versions, the URL structure, vocabulary, and filesystem
conventions are stable. Migrations are additive. The Tauri layer and SQL
schema set up in v0.0.1 carry the product all the way to v1.0.0.

---

_End of Mozart architecture spec._
