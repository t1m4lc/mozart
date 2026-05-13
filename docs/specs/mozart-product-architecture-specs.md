# Mozart Product Architecture Specification

Edited 11 may 2026

## Core Plugin, Project Templates, Scoped Settings, Composer References, and Future Extensibility

## 1. Purpose

This document defines Mozart's product and architecture model for the next phases of development.

The goal is to keep the v0.1 product simple while making the internal model future-proof for:

- sandboxed workspaces based on Git worktrees;
- built-in skills and slash commands;
- project templates;
- clean settings inheritance;
- global and project-level MCP configuration;
- model defaults and future model routing;
- composer references using `/`, `@`, `@web`, and `#`;
- future plugins and multi-agent orchestration.

Explicit non-goals for the current phase:

- no external plugin marketplace;
- no visible task graph;
- no multi-agent orchestration;
- no automatic multi-branch merge orchestration;
- no swarm-like communication;
- no complex model router.

---

## 2. Product Vision

Mozart is an AI workspace conductor.

The user should not feel like they are managing a raw chat session. They should feel like Mozart helps them move from intent to execution:

1. describe a task;
2. add relevant context;
3. plan the work;
4. create or reuse a sandboxed workspace;
5. run the agent in that workspace;
6. review changes;
7. fix issues;
8. commit and later open a pull request.

The v0.1 experience should stay focused on coding workflows, but the architecture should later support non-code project templates such as HR, recruiting, administrative work, sales, and customer support.

---

## 3. Core Product Model

The long-term internal model should be:

```text
Global / Profile
  > Project
    > Task
      > Workspace
        > ChatThread
          > AgentRun
```

The initial v0.1 UI should remain simpler:

```text
Project
  > Workspace
    > Chats
```

Tasks may exist internally in v0.1, but they should not become a primary visible navigation level yet.

### Definitions

#### Global / Profile

The user-level state and preferences shared across all projects.

Examples:

- user profile;
- connected accounts;
- globally configured integrations;
- globally configured MCP servers;
- global skills;
- available models;
- default model;
- default effort;
- UI preferences;
- telemetry consent.

#### Project

A project is the main configuration boundary.

A project may be backed by:

- an existing repository;
- a new local folder;
- a generated folder structure from a project template;
- a repository created from a project template.

Project-level state includes:

- repository or folder path;
- selected project template;
- project instructions;
- enabled project skills;
- enabled project MCP servers;
- project integrations;
- model defaults;
- routing rules;
- auto workspace settings.

#### Task

A task represents a work intention.

For v0.1, tasks should remain mostly internal.

Task-level state includes:

- title;
- description;
- attached context;
- selected flow;
- generated plan;
- status;
- linked workspaces.

Heavy settings such as skills, MCP, plugin activation, and routing rules should not be configured at task level for now.

#### Workspace

A workspace is the execution boundary.

A workspace is a sandboxed environment composed of:

- one Git worktree;
- one Git branch;
- one attached terminal session;
- one current working directory;
- one file watcher;
- one diff context;
- multiple chat threads;
- multiple sequential agent runs.

Workspace-level state includes:

- worktree path;
- branch name;
- base branch;
- terminal session;
- dirty state;
- linked task;
- active settings snapshot;
- active MCP snapshot;
- active model routing snapshot;
- project instructions snapshot.

A workspace should capture a snapshot of relevant project settings when it is created. This keeps existing workspaces stable even if project settings later change.

#### ChatThread

A chat thread is a conversation attached to a workspace.

A workspace may contain multiple chat threads, for example:

- main implementation chat;
- review chat;
- fix tests chat;
- explanation chat;
- all files tab.

#### AgentRun

An agent run is one execution cycle within a chat thread.

It may represent:

- a planning run;
- an implementation run;
- a review run;
- a fix run;
- a commit-message run;
- an explanation run.

---

## 4. Settings Scopes and Inheritance

Mozart should use a simple and predictable settings hierarchy.

```text
Global defaults
  ↓
Project overrides
  ↓
Workspace snapshot / override
  ↓
Chat or Run override
```

Settings resolution order:

```text
Run override
else Chat override
else Workspace snapshot
else Project setting
else Global setting
else Core default
```

Pseudo-code:

```ts
function resolveSetting(key, run, chat, workspace, project, global, coreDefaults) {
  return (
    run.override?.[key] ??
    chat.override?.[key] ??
    workspace.snapshot?.[key] ??
    project.settings?.[key] ??
    global.settings?.[key] ??
    coreDefaults[key]
  );
}
```

### Settings by Scope

#### Global / Profile Scope

Global settings may include:

- global default model;
- global default effort;
- available providers;
- configured API keys;
- global integrations;
- global MCP servers;
- global skills;
- telemetry preferences;
- appearance preferences.

#### Project Scope

Project settings may include:

- project default model;
- project default effort;
- enabled project skills;
- enabled project MCP servers;
- project instructions;
- project-specific model routing rules;
- auto workspace mode;
- default flow: plan first or start directly.

#### Task Scope

Task scope should remain lightweight.

Task state may include:

- attached files;
- attached folders;
- attached web context;
- selected skill for the next step;
- selected model override for the task if necessary;
- generated plan.

Task-level skill, MCP, or plugin configuration should not be introduced yet.

#### Workspace Scope

Workspace scope should contain a snapshot of the project configuration at creation time.

The snapshot may include:

- enabled skills;
- enabled MCP servers;
- model defaults;
- model routing rules;
- project instructions version;
- environment-related settings.

---

## 5. Mozart Core Plugin

Mozart should introduce the concept of a required internal `Mozart Core Plugin`.

This is not an external plugin system. It is a product and architecture concept used to isolate Mozart's built-in workflow logic.

The Mozart Core Plugin is:

- installed by default;
- required;
- non-removable;
- non-disableable;
- partially configurable.

It owns:

- built-in skills;
- slash commands;
- task detection;
- auto workspace flow;
- next-step suggestions;
- default model routing behavior;
- default skill model and effort settings.

Initial built-in skills:

```text
/plan
/implement
/review
/fix
/commit
/workspace
/context
```

Future built-in commands may include:

```text
/model
/mcp
/skills
```

The Core Plugin should drive the guided v0.1 workflow.

Example:

```text
User:
Refactor the settings page to use Spartan UI components.

Mozart Core:
1. Detects this as a new coding task.
2. Suggests adding context or planning first.
3. Creates an internal Task record.
4. Creates a workspace if Auto Workspace is enabled.
5. Runs /plan.
6. Stores the plan in workspace context.
7. Suggests /implement.
```

---

## 6. Skills

A skill is a reusable workflow that can be called by the user or by Mozart Core.

Skills are usually exposed through slash commands.

Examples:

```text
/plan
/implement
/review
/fix
/commit
/guard
/atomize
```

### Skill Sources

For now, skills should come from only three sources:

```text
Mozart Core
User
Project Template
```

Do not introduce plugin-provided skills yet.

Do not introduce workspace-level skill management yet.

A workspace may contain a snapshot of active skills inherited from the project, but users should not manage skills directly at workspace level in the current phase.

### Skill Metadata

Each skill should support:

```ts
type Skill = {
  id: string;
  command: string;
  name: string;
  description: string;
  body: string;

  source: "core" | "user" | "project_template";
  scope: "global" | "project";

  default_model?: string;
  default_effort?: "low" | "medium" | "high" | "max";

  required_tools?: string[];
  enabled: boolean;
};
```

Examples:

```text
/plan
  default_model: auto
  default_effort: high
  source: core

/commit
  default_model: auto
  default_effort: low
  source: core

/guard
  default_model: auto
  default_effort: high
  source: project_template
```

---

## 7. MCP Configuration

MCP servers connect Mozart agents to external tools and data sources.

MCP should be configurable only at these scopes for now:

```text
Global
Project
```

Do not introduce task-level MCP configuration yet.

Do not introduce workspace-level MCP management yet.

A workspace may contain a snapshot of the MCP servers inherited from the project at creation time, but users should manage MCP servers through Global or Project settings.

### Global MCP

Global MCP servers are available across projects unless disabled at project level.

Examples:

- filesystem;
- GitHub;
- Linear;
- Supabase;
- Postgres;
- documentation search.

### Project MCP

Project MCP servers are enabled or configured for one specific project.

Examples:

- a project-specific Postgres database;
- a project-specific GitHub repository;
- a project-specific Linear workspace;
- a project-specific Supabase project.

### Future MCP Settings UI

Settings > MCP should eventually allow users to:

- list configured MCP servers;
- add a server;
- remove a server;
- enable or disable a server;
- test connection;
- inspect exposed tools;
- view logs and errors;
- configure Global or Project scope.

---

## 8. Project Templates

A Project Template is a starter kit for creating a Mozart project.

A template is not necessarily a visible Git repository. It may create a repository, a local folder, a file structure, project instructions, skills, and default settings.

### Template Responsibilities

A project template may provide:

- initial folders;
- initial files;
- project instructions;
- preloaded skills;
- recommended MCP servers;
- recommended integrations;
- model defaults;
- effort defaults;
- default flow settings;
- example tasks.

### Initial Template Examples

Coding-oriented templates:

```text
Blank Project
Existing Repository
GStack Workflow
Angular + Spartan UI
NestJS API
Supabase RLS Audit
Code Review Workspace
```

Future business-oriented templates:

```text
HR Assistant
Recruiting Pipeline
Administrative Workspace
Sales Outreach Workspace
Customer Support Workspace
```

### Template Manifest

Example shape:

```ts
type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  category:
    | "developer"
    | "business"
    | "hr"
    | "admin"
    | "sales"
    | "recruiting"
    | "custom";

  creates: {
    repository?: boolean;
    folders?: string[];
    files?: TemplateFile[];
  };

  preloaded: {
    skills?: string[];
    mcpServers?: string[];
    integrations?: string[];
  };

  defaults: {
    model?: string;
    effort?: "low" | "medium" | "high" | "max";
    autoWorkspace?: boolean;
    defaultFlow?: "plan_first" | "start_directly";
    defaultSkill?: string;
    routingRules?: ModelRoutingRule[];
  };

  instructions?: string;
};
```

Example:

```json
{
  "id": "gstack-workflow",
  "name": "GStack Workflow",
  "category": "developer",
  "creates": {
    "repository": false,
    "folders": ["docs/specs", "docs/decisions", ".mozart/skills"],
    "files": [
      {
        "path": ".mozart/project.md",
        "content": "# Project Context\n\nUse GStack-style planning and guarded implementation."
      }
    ]
  },
  "preloaded": {
    "skills": ["/plan", "/guard", "/atomize", "/implement", "/review"],
    "mcpServers": []
  },
  "defaults": {
    "autoWorkspace": true,
    "defaultFlow": "plan_first",
    "defaultSkill": "/plan",
    "effort": "high"
  }
}
```

---

## 9. Project Creation Flow

The Create Project flow should support:

### Step 1 — Source

```text
Existing repository
New folder
From project template
```

### Step 2 — Template

```text
Blank Project
GStack Workflow
Angular + Spartan UI
Future business templates
```

### Step 3 — Capabilities

Display the capabilities the template will enable or recommend:

```text
Skills:
  /plan enabled
  /review enabled
  /guard enabled

MCP:
  filesystem recommended
  GitHub optional
  Linear optional

Integrations:
  GitHub optional
```

### Step 4 — Defaults

```text
Auto workspace: ON
Default model: Auto
Default effort: Medium
Default flow: Plan first
```

### Step 5 — Create

Create the project, apply template files, configure project settings, and open the project workspace view.

---

## 10. Workspace Flow

The ideal v0.1 workflow:

```text
1. User enters a task.
2. Mozart detects whether this is a new task or continuation.
3. Mozart proposes:
   - Add context
   - Plan first
   - Start directly
   - Use current workspace
   - Create new workspace
4. If Auto Workspace is enabled:
   - create a workspace when appropriate;
   - generate a workspace name from a curated list of famous music artists;
   - generate a branch name from the task title;
   - attach the terminal to the new worktree.
5. Run /plan.
6. User validates or edits the plan.
7. Run /implement.
8. Continue with /review, /fix, and /commit.
```

### Workspace Naming

Workspace names may be generated from a curated list of famous music artists.

Examples:

```text
bowie
prince
aretha
coltrane
hendrix
bjork
eminem
daft-punk
aznavour
whitney
```

Collision handling:

```text
prince
prince-2
prince-3
```

### Branch Naming

Branch names should be generated from task titles.

Example:

```text
Task: Refactor settings page to use Spartan components
Branch: feat/refactor-settings-spartan-components
Workspace: bowie
```

---

## 11. Composer Command Center

The chat composer should become a command center.

It should support:

- `/` for skills and commands;
- `@` for context mentions;
- `@web` for web context;
- `#` for project, workspace, task, branch, PR, issue, commit, chat, or run references.

### Slash `/`

Slash opens the skill and command menu.

Examples:

```text
/plan
/implement
/review
/fix
/commit
/workspace
/context
```

The autocomplete menu should show:

- command;
- description;
- source;
- resolved model;
- resolved effort;
- required tools.

Example display:

```text
/plan
Analyze the codebase and produce a step-by-step plan.
Model: Auto → Claude Sonnet
Effort: High
Source: Mozart Core
```

### Mention `@`

`@` adds local project context.

It should support:

- files;
- folders;
- symbols;
- current diff;
- terminal output;
- previous plan;
- documentation files.

Examples:

```text
@apps/desktop/src/app/settings/settings.page.ts
@libs/ui
@docs/specs/plan-v0.0.1.md
@current-diff
@terminal
```

Possible internal shape:

```ts
type MentionContext =
  | { type: "file"; path: string }
  | { type: "folder"; path: string }
  | { type: "symbol"; file: string; name: string }
  | { type: "diff"; scope: "current" }
  | { type: "terminal"; session_id: string }
  | { type: "plan"; task_id: string };
```

### Web Mention `@web`

`@web` adds external web context from a URL.

Examples:

```text
@web https://cursor.com
@web https://docs.anthropic.com/en/docs/claude-code
@web https://github.com/garrytan/gstack
```

Expected behavior:

1. User types `@web` followed by an HTTPS URL.
2. Mozart fetches the page content.
3. Mozart converts useful content to Markdown when possible.
4. Mozart stores the fetched content as an attached context item.
5. The agent can use that context in the next run.

Possible implementation path:

- use a lightweight fetcher first;
- fetch with `curl` or an internal HTTP client;
- extract readable content;
- convert to Markdown;
- cache the result;
- show a preview before attaching.

Because web fetching can add dependencies, security concerns, and app size, this may be implemented as an optional capability later.

Product decision:

```text
@web should be part of the composer concept now,
but the actual web fetcher may be implemented later as an optional capability.
```

Future plugin option:

```text
Web Context Plugin
  - provides @web fetching
  - converts HTML to Markdown
  - caches pages
  - supports robots/limits policy
  - exposes web context attachments to the agent
```

Security and safety considerations:

- allow only HTTP/HTTPS URLs;
- prefer HTTPS;
- avoid local network requests by default;
- block localhost/private IP ranges unless explicitly allowed;
- show fetched domain before attaching;
- cache and timestamp fetched content;
- allow users to remove web context from the run.

Possible internal shape:

```ts
type WebContext = {
  type: "web";
  url: string;
  title?: string;
  fetched_at: number;
  content_type?: "html" | "markdown" | "text";
  markdown?: string;
  raw_text?: string;
  status: "pending" | "fetched" | "failed";
  error?: string;
};
```

### Hash `#`

`#` references Mozart, Git, or integration objects.

It should support:

- task references;
- workspace references;
- branch references;
- pull request references;
- issue references;
- commit references;
- agent run references;
- chat references.

Examples:

```text
#bowie
#feat/settings-spartan-refactor
#PR-42
#task-settings-refactor
#run-128
```

Possible internal shape:

```ts
type HashReference =
  | { type: "task"; task_id: string }
  | { type: "workspace"; workspace_id: string }
  | { type: "branch"; name: string }
  | { type: "pull_request"; provider: "github"; id: string | number }
  | { type: "issue"; provider: "github" | "linear"; id: string }
  | { type: "commit"; sha: string }
  | { type: "agent_run"; run_id: string }
  | { type: "chat"; chat_thread_id: string };
```

---

## 12. Model Defaults and Simple Model Routing

Model routing should remain simple for now.

The first version should support:

- user default model;
- project default model;
- skill default model;
- skill default effort;
- run-level manual override;
- fallback model.

The UI should explain the resolved model:

```text
Model: Auto
Resolved: Claude Sonnet · High effort
Reason: /plan skill
```

Do not implement complex model routing yet.

Future model routing may consider:

- selected skill;
- context size;
- task type;
- risk level;
- expected cost;
- expected latency;
- project preferences;
- provider availability.

Example future routing rule:

```ts
type ModelRoutingRule = {
  id: string;
  name: string;
  when: {
    skill?: string;
    context_size?: "small" | "medium" | "large";
    task_type?: "planning" | "coding" | "review" | "debug" | "commit";
    risk?: "low" | "medium" | "high";
  };
  use: {
    model: string;
    effort: "low" | "medium" | "high" | "max";
  };
  fallback?: {
    model: string;
    effort: "low" | "medium" | "high";
  };
};
```

---

## 13. Integrations

Integrations are account or service connections.

They are different from MCP servers.

Example:

```text
GitHub Integration = authentication, repository access, PR metadata
GitHub MCP = tools exposed to the agent
```

Initial useful integrations:

- GitHub;
- PostHog;
- Linear later;
- Supabase later.

GitHub may become important for:

- pull request creation;
- PR status;
- issue linking;
- branch metadata;
- merge status.

---

## 14. Future External Plugins

External plugins should not be implemented now.

In the future, plugins may provide:

- MCP server definitions;
- project templates;
- integrations;
- model routing rules;
- hooks;
- commands;
- optional capabilities such as web context fetching.

Do not introduce plugin-provided skills yet in the current spec.

Do not build a plugin marketplace yet.

The only required plugin-like concept now is the internal Mozart Core Plugin.

---

## 15. Priorities

### P0 — Core v0.1 Coding Flow

- Project > Workspace > Chats;
- Git worktree + branch workspace;
- terminal attached to worktree;
- sandboxed workspace rules;
- built-in skills;
- slash command picker `/`;
- internal Task entity;
- AgentRun linked to workspace and chat.

### P1 — Mozart Core Plugin and Guided Flow

- required Mozart Core Plugin;
- auto workspace flow;
- task detection;
- next-step suggestions;
- Add context flow;
- workspace names from music artists;
- branch name from task title.

### P2 — Clean Scopes and Settings Inheritance

- Global/Profile settings;
- Project settings;
- Workspace config snapshot;
- settings inheritance;
- global skills;
- project skills;
- global MCP;
- project MCP;
- project model defaults.

### P3 — Composer Command Center

- `/` skill autocomplete;
- `@` file/folder/symbol/context autocomplete;
- `@web https://...` web context attachment concept;
- `#` workspace/task/PR/branch/issue/commit autocomplete;
- context chips;
- resolved context preview.

### P4 — Project Templates

- Create Project from template;
- built-in templates;
- template-created files and folders;
- template-preloaded skills;
- template-recommended MCP;
- template model defaults.

Initial templates:

- Blank Project;
- Existing Repository;
- GStack Workflow;
- Angular + Spartan UI.

### P5 — Skill Model Defaults and Simple Model Routing

- skill default model;
- skill default effort;
- project default model;
- user default model;
- run-level override;
- simple model router;
- model override UI.

### P6 — MCP Management

- Settings > MCP;
- add/remove MCP;
- enable/disable MCP;
- Global/Project scope;
- inspect tools;
- test connection;
- view logs.

### P7 — Integrations

- GitHub integration;
- PR references;
- PR creation;
- issue linking;
- Linear later;
- Supabase later.

### P8 — Optional Web Context Capability

- implement `@web` fetching;
- convert HTML to Markdown;
- cache fetched pages;
- display preview;
- enforce safe URL policy;
- possibly ship as optional Web Context Plugin later.

### P9 — External Plugin Manifest

- plugin manifest;
- plugin can provide MCP definitions;
- plugin can provide project templates;
- plugin can provide integrations;
- plugin can provide routing rules;
- plugin can provide optional capabilities;
- plugin permissions.

### P10 — Visible Task UI

- task list;
- task detail;
- task status;
- task-to-workspace mapping;
- task history.

Not now.

### P11 — Multi-Agent / Multi-Workspace Orchestration

- task graph;
- subtasks;
- dependency graph;
- N workspaces per task;
- parallel runs;
- integration workspace;
- merge plan;
- conflict resolution.

Not now.

---

## 16. Final Product Decisions

### Keep for v0.1

```text
Project > Workspace > Chats
```

### Keep internally

```text
Global/Profile > Project > Task > Workspace > ChatThread > AgentRun
```

### Settings boundaries

```text
Global/Profile = user defaults and global capabilities
Project = configuration boundary
Task = work intention and attached context
Workspace = execution boundary and config snapshot
```

### Skills

For now:

```text
Mozart Core skills
User skills
Project Template skills
```

Not now:

```text
Plugin-provided skills
Workspace-managed skills
Task-managed skills
```

### MCP

For now:

```text
Global MCP
Project MCP
Workspace snapshot only
```

Not now:

```text
Task-level MCP management
Workspace-level MCP management UI
```

### Templates

```text
Project Template = starter kit
Repository = optional technical output
```

### Composer

```text
/     = skills and commands
@     = local context
@@  = external web context URL if not an url it make a search on google.
#     = Mozart, Git, or integration references, PR, Chat, workflow...
```

### Strategic Summary

Mozart v0.1 should be:

```text
Core Plugin + Sandboxed Workspace + Skills Flow + Clean Scopes
```

Not:

```text
Marketplace + Visible Task Manager + Multi-Agent Swarm
```
