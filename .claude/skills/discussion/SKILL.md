---
name: discussion
description: Conversation-only mode for forcing ambiguity into the open before any code is written. Spawns codebase-explorer to map existing surfaces, asks clarifying questions, and writes a structured summary to .context/context.md when the discussion reaches a natural stop. Never edits source code. Use this when the user describes a feature, a bug, or a decision and you don't yet know enough to plan.
---

# /discussion

> "You need clarity to guide agents effectively. If you don't understand the codebase, neither will they." — Pane

## Mode and effort

- **Enter plan mode immediately** via `EnterPlanMode` at step 1. This skill must NOT edit source code; plan mode is the mechanical guarantee. Stay in plan mode for the entire skill — do NOT call `ExitPlanMode` (the only output is `.context/context.md`, which we write at the very end after exiting cleanly).
- **Thinking effort:** `think hard` when synthesising answers from codebase-explorer output. Bump to `think harder` if the user's request involves cross-cutting design (Rust ↔ Angular IPC, schema migrations, theme system reach). Use `ultrathink` only if the user explicitly asks for deep reasoning ("really think this through").

## Hard rules

1. **Never edit, create, or delete source code.** Touching the working tree in this skill is a bug.
2. **Spawn `codebase-explorer` for every "where / what / how" question that can be answered from the repo.** Don't grep yourself when an exploration is the right tool.
3. **One question at a time** in the conversation thread. Batch only when truly independent.
4. **End by writing `.context/context.md`** — a flat summary the next skill (`/plan`) can read cold.

## Procedure

### 1. Restate the request

In one sentence, mirror what the user asked. Confirm before going further. If the user pushed back during this restate, redo it.

### 2. Map the surface

Spawn `codebase-explorer` with a precise question. Examples:
- "Find all files involved in workspace creation, return tree view with one-line summaries."
- "Walk me through how the Tauri window is configured end-to-end."
- "List all places that consume the design tokens from `libs/shared-styles-theme`."

Read the result. Quote `file:line` references when discussing with the user.

### 3. Surface unknowns

Identify the things you cannot answer from the repo alone. Examples:
- Naming choice (no convention exists yet)
- Scope boundary (could be M5 or could be M6)
- External library question (needs research, not exploration)
- Product decision (needs the user's judgment, not the agent's)

Ask one targeted question. Use `AskUserQuestion` for choice-type questions; use plain prose for open-ended ones.

### 4. Iterate

Each answer generates more questions. Keep going until you can write a sentence like "I now know enough to draft a plan." If you keep finding unknowns after ~5 rounds, the request is too big — propose splitting it.

### 5. Write `.context/context.md`

When the conversation stabilises, exit plan mode via `ExitPlanMode` with a one-line summary ("Writing discussion outcome to .context/context.md"). Then write `.context/context.md` (overwrite — this file is the latest discussion outcome, not history) with:

```markdown
# Discussion context — <short title>
**Date:** YYYY-MM-DD
**Trigger:** <what the user originally asked>

## What we're trying to do
<2–4 sentences>

## Verified repo facts (from codebase-explorer)
- file:line — fact

## Decisions locked in this discussion
- <decision> — rationale

## Open questions deferred to /plan
- <question> — what info would resolve it

## Out of scope
- <thing> — why
```

Tell the user the file is written and suggest `/plan` next.

## What this skill must NOT do

- No edits to anything under `apps/`, `libs/`, `src-tauri/`, or `Cargo.toml` / `package.json`.
- No commits.
- No spawning `implementer` or `plan-reviewer` (wrong skill for those).
- No writing to `tmp/ready-plans/` (that's `/plan`'s job).
