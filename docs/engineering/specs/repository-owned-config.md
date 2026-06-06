---
id: epic.repository-owned-config
type: epic
title: Repository-Owned Configuration
status: draft
priority: high
owner: timothy
created: 2026-05-16
updated: 2026-05-16
tags: [config, settings, dot-mozart, workspace, snapshot]
related:
  - vision.project-operating-system
  - epic.repository-owned-specs
dependsOn: []
targetVersion: 0.0.1
---

# Repository-Owned Configuration — `.mozart/settings.json`

Parent: [Mozart Project Operating System](./project-operating-system.md)

## Goal

Let a repository declare Mozart-facing project behavior in a single versionable file at `.mozart/settings.json`, so teams can share project defaults via git, and any contributor sees the same instructions, scripts, model routing, and security rules.

## Non-goals

- Storing secrets, credentials, or API keys.
- Automatic script execution.
- Overriding user-global security or privacy settings.
- Defining the full UI for editing the file (this comes later).
- `.mozart/settings.local.json` (deferred to a later version).

## User value

Today, project behavior lives in the user's local UI settings. New contributors must reconfigure everything. Teams cannot review project conventions in PR. Mozart cannot guarantee reproducibility across machines.

With `.mozart/settings.json`:

- Onboarding becomes: clone repo → open in Mozart → settings already applied.
- Project conventions become reviewable in PR.
- Reproducibility improves because the workspace snapshot is grounded in a versioned file.

## Schema v1 (proposed)

```json
{
  "$schema": "https://mozart.build/schemas/settings.v1.json",
  "version": 1,
  "project": {
    "name": "Mozart",
    "description": "AI workspace conductor for developers"
  },
  "instructions": {
    "files": [".mozart/instructions.md", "CLAUDE.md", "AGENTS.md"],
    "default": "Follow the project architecture and keep changes atomic."
  },
  "workspace": {
    "defaultBase": "main",
    "autoCreateInitialWorkspace": true,
    "initialChatName": "Start",
    "previewUrl": "http://localhost:$MOZART_PORT",
    "filesToCopy": [".env.example"]
  },
  "agents": {
    "defaultSkill": "plan",
    "enabledSkills": ["plan", "implement", "review", "fix", "commit"],
    "modelRouting": {
      "plan": { "provider": "anthropic", "model": "claude-sonnet" },
      "implement": { "provider": "anthropic", "model": "claude-sonnet" },
      "review": { "provider": "openai", "model": "gpt-5.5-thinking" }
    }
  },
  "scripts": {
    "setup": "pnpm install",
    "dev": "pnpm nx serve desktop",
    "test": "pnpm nx affected -t test",
    "lint": "pnpm nx affected -t lint",
    "build": "pnpm nx affected -t build"
  },
  "mcp": {
    "enabledServers": []
  },
  "security": {
    "denyRead": [".env", ".env.*", "**/.env", "**/.env.*"],
    "requireApprovalFor": ["commit", "reset", "revert", "push"]
  }
}
```

`version` is mandatory. Unsupported versions are ignored with a UI warning. Unknown keys are accepted and warned (forward compatibility).

## Settings categories and precedence

**Repo-owned** (shared defaults the repo can dictate):

- `project.*`, `instructions.*`, `workspace.*`
- `agents.enabledSkills`, `agents.modelRouting` (as recommendation)
- `scripts.*`
- `mcp.enabledServers` (as request, requires user approval)
- `security.denyRead`, `security.requireApprovalFor`

**User-owned** (always wins, repo cannot override):

- provider API keys and credentials
- personal model preference (may override repo `modelRouting`)
- telemetry preference
- theme/appearance
- account/auth
- local paths outside repository

**Resolution order:**

```
Core defaults
  → Repo shared defaults  (.mozart/settings.json)
    → User global settings
      → Local project user overrides
        → Workspace snapshot
          → Chat/Run override
```

For categories classified as "personal," user/local layers always win regardless of position in the chain. The classification is hard-coded in Mozart and cannot be changed by repo config.

## Validation and errors

| Condition           | Behavior                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| Missing file        | No error. Apply defaults silently.                                         |
| Invalid JSON        | Project warning in Settings page + Config health card on project overview. |
| Schema mismatch     | Field-level warning; valid fields still applied.                           |
| Unsupported version | Warning + ignore unsupported fields; supported fields applied.             |
| Unsafe value        | Reject specific field, warn, fall back to default.                         |
| Unknown keys        | Soft warning (forward compat) unless a future "strict mode" is enabled.    |

Validation surfaces:

- Project Settings page.
- Project overview ("Config health" card).
- Workspace creation flow (block creation only on schema mismatch severe enough to break snapshot).

## UI/UX behavior

The Settings UI must distinguish setting sources:

- Badge **From repo config** for values resolved from `.mozart/settings.json`.
- Badge **Local override** when the user has set a value that wins over the repo.
- A **Reset to repository default** action where applicable.
- An **Open `.mozart/settings.json`** action linking to the file.
- A **Create `.mozart/settings.json`** action when the file is missing.
- An **Export current project settings to `.mozart/settings.json`** action, generating a file from current local state.
- A "Config invalid" banner with one-click jump to the offending field when validation fails.

Wording stays product-oriented. The project's UI vocabulary invariants apply: use `workspace`, `branch` (badge form), `run`, `candidate`, `review`, `merge`. Avoid low-level Git internals in user-facing strings.

## Workspace snapshot integration

On workspace creation, Mozart:

1. resolves the full settings stack;
2. normalizes the result;
3. computes a hash of the source `.mozart/settings.json` file (or records "absent");
4. stores `{ resolvedConfig, sourceHash, validationResult, sourceMap }` in SQLite, attached to the workspace.

The snapshot is immutable for the lifetime of the workspace. Future changes to `.mozart/settings.json` affect new workspaces only.

### Base branch (implemented)

The schema above is the proposed end-state; the **shipped** key for the branch a
new workspace forks from is `git.baseBranch` (see `docs/settings.default.json`,
default `"main"`):

```json
{ "git": { "baseBranch": "develop", "mergeAction": "pr" } }
```

Resolution at creation (`WorkspacesFacade.createForPrompt`):

1. an **explicit** base branch (from the picker) if it exists in the repo;
2. else the project's configured `git.baseBranch` (resolved settings: defaults
   ◀ global ◀ project) if it exists;
3. else `main`;
4. else the first branch.

A configured branch that no longer exists falls through to the `main`/first
fallback, so a stale setting never blocks creation.

The instant "+" affordance uses the resolved default. A **"New workspace from
branch…"** entry in the project context menu opens a picker (spartan combobox)
preselected to that default, letting the user fork from any branch per
workspace without changing the setting.

## Security model

- **No secrets in repo config.** Strings matching key/token/credential patterns are rejected with a validation error.
- **Scripts never auto-run.** `scripts.*` declares commands the user can run from the UI. The command text is shown before execution.
- **Path safety.** Paths in `instructions.files`, `workspace.filesToCopy`, `security.denyRead` must resolve inside the repository. Path traversal is rejected.
- **MCP gating.** `mcp.enabledServers` is a request, not an order. Unknown MCP servers require explicit user approval before connection.
- **Union, not override, on restrictions.** `security.denyRead` and `security.requireApprovalFor` may **add** restrictions to user globals but cannot remove them.
- **No credentials.** Repo config can recommend providers/models but never carries credentials.

> **Core principle.** A repo can add constraints, but cannot silently weaken user-defined constraints.

## Data model / persistence

Internal types (conceptual; not yet implemented):

- `RepoConfigSource` — raw file bytes, hash, parse status.
- `RepoConfigParsed` — JSON object, version, schema validation result.
- `ResolvedProjectSettings` — fully merged settings with per-field source metadata.
- `WorkspaceConfigSnapshot` — frozen copy attached to a workspace.
- `LocalProjectOverrides` — per-user local layer stored in SQLite.

Persistence locations:

- `.mozart/settings.json` lives in the repo.
- All other layers (user global, local overrides, workspace snapshots, validation results) live in SQLite.

Domain placement (Mozart architecture): a new `domains/project-config/` with the usual facade pattern. Adapters live as `*-tauri.adapter.ts` files; `@tauri-apps/api` imports are isolated there.

## Implementation slices

Each slice is a candidate atomic task.

1. **Schema definition** — TypeScript types + JSON Schema for v1.
2. **Discovery service** — locate `.mozart/settings.json` at repo root; do not traverse parents.
3. **Parser + validator** — strict JSON parse, schema validation, error model.
4. **Settings resolver** — merge layers with per-field source tracking.
5. **SQLite persistence** — store parsed config state, validation results, source hash.
6. **Config health card** — minimal project-overview surface for status + errors.
7. **Settings UI badges and source labels** — render `From repo config` / `Local override`.
8. **Export action** — generate `.mozart/settings.json` from current local state.
9. **Workspace snapshot integration** — capture resolved config on workspace creation.
10. **Tests and edge cases** — see below.

## Test scenarios (Given / When / Then)

- **Missing config** — Given no `.mozart/settings.json`, when the project loads, then settings resolve from user + defaults, with no validation warning.
- **Valid config** — Given a well-formed file, when the project loads, then resolved values reflect the file and source badges show `From repo config`.
- **Invalid JSON** — Given a syntactically broken file, when the project loads, then a Config health warning surfaces and resolution falls back to defaults for affected fields.
- **Schema mismatch** — Given a field with wrong type, when the project loads, then that field reverts to default and a field-level warning appears; other fields apply normally.
- **Unsupported version** — Given `version: 99`, when the project loads, then unsupported fields are ignored, supported fields apply, and a banner explains the version mismatch.
- **Unknown fields** — Given an unknown key, when the project loads, then it is preserved in raw form, ignored at resolution, and a soft warning appears.
- **Unsafe path** — Given `workspace.filesToCopy: ["../../etc/passwd"]`, when the project loads, then the entry is rejected with a security warning.
- **Personal setting collision** — Given the repo sets `agents.modelRouting.implement` and the user has a local model preference, when resolution runs, then the user's preference wins.
- **Workspace snapshot stability** — Given a workspace created with config A, when `.mozart/settings.json` changes to B, then the workspace continues to resolve with snapshot A.
- **Config hash changes** — Given the file is edited, when the project reloads, then the source hash changes and new workspaces use the new resolved config.
- **Security union rule** — Given user global denies `.env` reads and repo config attempts to allow them, when resolution runs, then `.env` remains denied.
- **MCP approval gate** — Given repo config requests an unknown MCP server, when the project loads, then the server is shown as "requested, awaiting approval" and not connected automatically.

## Open questions

- Should the UI write directly to `.mozart/settings.json`, or only support Export?
- `.mozart/settings.local.json` — defer to v2?
- Strict mode for unknown keys — opt-in flag in settings?
- File watcher for hot-reload, or refresh-on-focus?
- Publish a public JSON Schema URL at `mozart.build/schemas/settings.v1.json`?

## Recommended v0.1.0-beta.1 scope

Slices 1–5 (discovery, parsing, validation, resolution, persistence) + slice 9 (workspace snapshot). UI surface is minimal: a Config health card and source badges on settings already visible. Export action and rich editor come later.
