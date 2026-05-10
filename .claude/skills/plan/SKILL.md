---
name: plan
description: Turns a discussion outcome (from .context/context.md or a user-supplied spec) into a detailed implementation plan saved to tmp/ready-plans/. Does codebase analysis, optional external research, fills the plan_base template, then runs an iterative plan-reviewer loop until confidence ≥ 8. Does NOT implement anything. Use after /discussion, before /atomize.
---

# /plan

Quality of implementation is downstream of quality of planning. This skill produces a single plan file that another agent can execute without re-deriving context.

## Mode and effort

- **Enter plan mode** via `EnterPlanMode` at step 1 and stay there for steps 1–3 (codebase analysis + research + draft). This blocks accidental edits during research.
- **Exit plan mode** before step 4 (writing the plan file to `tmp/ready-plans/` is a Write operation). The exit summary should be one line: "Writing plan to tmp/ready-plans/<file>.md".
- **Thinking effort:**
  - Step 1 (codebase analysis): `think` — usually mechanical lookups
  - Step 2 (research): `think hard` if evaluating tradeoffs between libraries/approaches
  - Step 3 (draft plan): **`think harder`** — this is where errors compound; bad plan = bad implementation
  - Step 5 (reviewer loop): `think hard` per iteration when deciding which BLOCKING/SUGGESTED items to incorporate
  - Use **`ultrathink`** for plans that touch the Rust ↔ Angular IPC boundary, the SQLite schema, or any decision flagged by the user as load-bearing.

## Inputs (in order of preference)

1. `.context/context.md` (latest discussion outcome — preferred)
2. A spec file the user names (e.g. `docs/PLAN-v0.0.1.md` section, or a milestone block in `docs/mozart-implementation-flow.md`)
3. A free-text request (last resort — strongly suggest running `/discussion` first)

## Procedure

### 1. Codebase analysis

Spawn `codebase-explorer` to identify:

- Reference files (existing similar features to model the new code on)
- Files this plan will need to modify or create
- Conventions in the touched layer (Angular standalone, Hlm directive prefix, Tauri command pattern, etc.)

### 2. External research (only if needed)

For library or API questions: WebFetch / WebSearch or use curl.md. Cite specific URLs in the plan. Skip if the answer is already in the repo or `CLAUDE.md`.

### 3. Draft the plan

Use `.claude/templates/plan_base.md`. Write to `tmp/ready-plans/<NN>-<slug>.md` where `NN` is the next free 2-digit number (check the directory first). Slug: kebab-case, ≤ 5 words.

### 4. Self-check

Before invoking the reviewer, verify:

- Every file path you wrote actually exists (or is explicitly marked "new file")
- Every command in the validation gate is runnable today
- No "TBD" / "TODO" / open questions in the plan
- Confidence score honest, not aspirational

### 5. Reviewer loop

```
spawn plan-reviewer with the plan path
parse BLOCKING / SUGGESTED / NIT
  if BLOCKING: ask the user about each blocker (use AskUserQuestion for choice, prose for open)
  if SUGGESTED: decide inline (mention in 1 sentence why you accepted/rejected)
  ignore NIT unless trivially fixable
update the plan
re-spawn a FRESH plan-reviewer (not a re-message)
loop until BLOCKING is empty AND confidence ≥ 8
```

### 6. Hand off

Tell the user:

- Path to the finished plan
- Confidence score
- Next step: `/atomize tmp/ready-plans/<file>.md`

## Plan quality rules (non-negotiable)

- **No backwards compatibility.** Replacing means replacing — no shims, no fallbacks (per Pane).
- **No aspirations, only instructions.** "Add a `useAuth` hook in `src/hooks/` that wraps `authService` and exposes `login`, `logout`, `isAuthenticated`" — not "Implement OAuth."
- **Scoped to one agent session.** If the task list will exceed ~8 atoms, split into multiple plans and write them as a sequence (`01-foo.md`, `02-foo-followup.md`).
- **Zero open questions.** Encounter one mid-draft → stop, resolve via discussion or research, then resume.
- **Single confidence score.** If under 8, you keep iterating, you don't ship the plan.

## What this skill must NOT do

- No source edits.
- No invoking `implementer` (that's `/implement`).
- No producing the atomic backlog (that's `/atomize`).
- No skipping the reviewer loop "because the plan looks fine."
