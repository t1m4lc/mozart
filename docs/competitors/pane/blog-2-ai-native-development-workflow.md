# Blog: Two Founders, 300k Lines, Zero Engineers — AI-Native Development Workflow

**Source:** https://runpane.com/blog/ai-native-development-workflow  
**Author:** Parsa (Dcouple Inc) · 2026-03-06  
**Context:** Two non-traditional founders, 300k line Next.js monorepo, 3-6 AI agents running in parallel across git worktrees.

---

## The Core Pipeline: 4 Commands, Every Feature

```
/discussion → /plan → /implement → /prepare-pr
```

**The core insight:** Quality of implementation is entirely downstream of quality of planning. Skip discussion and planning → death loop.

---

## /discussion — Clarity Before Code

- Conversation only. Never edits, creates, or deletes source code.
- Spawns `codebase-explorer` and `researcher` subagents as needed.
- Only output: talking to you + writing decisions to `.context/context.md`

The rabbit hole loop:
1. "Are there any [X] components in the codebase already?"
2. "Find all files related to [X], return tree view with short summaries."
3. "Walk me through how [X] works end-to-end, include file names."
4. Each answer generates new questions. Keep going until you have clarity.

When discussion reaches natural conclusion → writes summary to `.context/context.md` (shared across worktrees via context file, not agent state).

**Key principle:** You need clarity to guide agents effectively. If you don't understand the codebase, neither will they.

---

## /plan — Turn Intent into Instructions

Does three things:
1. **Codebase analysis** — searches similar features, identifies reference files, notes conventions
2. **External research** — library docs, implementation examples, best practices (specific URLs)
3. **Plan generation** — structured template: pseudocode, file refs, error handling, task list in execution order

Plan saved to `./tmp/ready-plans/`. Then enters **iterative review loop**:
- Spawns fresh `plan-reviewer` subagent
- Reviewer checks: gaps, simplification opportunities, correctness, codebase consistency
- Reviewer's recommendations → questions for you → you decide what to incorporate
- Fresh reviewer evaluates updated plan → loops until satisfied

### Plan Quality Rules
- **No backwards compatibility.** If something is being replaced, replace it completely. No shims, no fallbacks.
- **No aspirations, only instructions.** "Implement OAuth" ✗. "Add a `useAuth` hook in `src/hooks/` that wraps `authService` and exposes `login`, `logout`, `isAuthenticated`" ✓
- **Scoped correctly.** If a plan is too big for one agent session, split it.
- **No open questions.** Encounter something unresolved → stop, research, resolve. Never write a plan with open questions.
- **Confidence score:** Rate every plan 1-10 for one-pass implementation success. Below 8 → keep iterating.

---

## /implement — Execute the Plan

Not "build this feature." Implements a specific, already-reviewed plan from `./tmp/ready-plans/`.

- Breaks plan into parallelizable chunks
- Spawns `implementer` subagents per chunk
- Chunking respects dependencies: schema → API → frontend; types → implementations
- Each chunk: implement → `typecheck` → `lint` → `format` → fix all issues before proceeding
- After all chunks: spawns `implementation-reviewer` subagent (checks typecheck/lint, verifies all tasks completed, flags gaps)
- On pass: plan moves `ready-plans/` → `done-plans/`

---

## /prepare-pr — Cross-Model Review

5 steps in sequence:
1. **Commit** changes grouped by `done-plans` (never `git add .` — reads plan, matches files, one logical commit per plan)
2. **Rebase** main onto branch, resolve trivial conflicts automatically
3. **Build** both apps, fix errors, re-run until both pass
4. **Codex review loop** — Codex runs as subagent inside Claude Code, reviews diff, Claude fixes, Codex reviews again → loops until no bugs (cross-model catches what self-review misses)
5. **Create/update PR** with description from done-plans + `--force-with-lease`

---

## Human Review Criteria

**Single responsibility principle: only one way to do something.**
- Re-using vs re-creating?
- Easy to understand?
- PR scoped to a single objective?
- Anti-patterns? (async imports mid-file, not using established repos/conventions)

Also run refactor analysis: zero relative imports, established service patterns, correct query libraries, thin pages with orchestration hooks.  
Target: 9.8/10

If code needs work → back to `/discussion`. Not back to `/implement`. The fix for bad code is almost never "try implementing again."

---

## The Death Loop (What to Avoid)

Spending the rest of the day trying to get a broken implementation to work.

**Causes:**
- Plan too big → agent runs out of context, takes shortcuts
- Not enough codebase research → agent makes wrong assumptions and builds on them
- Vague instructions → agent picks one of 100 possible implementations

**Fix:** Always go back to `/discussion`. Understand more. Plan more precisely. Scope more tightly.

---

## The Skill That Actually Matters

Not coding. It's:
- Decomposing problems into agent-sized tasks
- Writing specs clear enough agents don't hallucinate
- Knowing when to research vs. implement
- Knowing when to just do it yourself
- Keeping the codebase clean so agents can reason on the next feature
- Keeping the monorepo so agents can reason about the full system
