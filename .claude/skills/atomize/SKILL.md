---
name: atomize
description: Converts a reviewed plan in tmp/ready-plans/ into TASKS.md — the atomic implementation backlog. Each atom is the smallest independently reviewable unit, with allowed/forbidden files, dependencies, acceptance criteria, tests, and a parallelizable flag. Does NOT implement anything. Use after /plan, before /implement.
---

# /atomize

Turns a plan into a backlog the `implementer` agent can execute one atom at a time, with each atom producing a small, focused commit.

## Mode and effort

- **Enter plan mode** for steps 1–4 (reading the plan, analysing conventions, decomposing, ordering). Exit before step 5 to write `TASKS.md`.
- **Thinking effort:** **`think harder`** for the decomposition (step 3) and dependency graph (step 4). Atom boundaries are the highest-leverage decision in this skill — wrong boundaries cascade into wrong commits, wrong reviews, and rework. Worth the tokens.
- For trivial plans (≤ 3 atoms, single layer): drop to `think hard`.

## Inputs

- Path to a plan in `tmp/ready-plans/<NN>-<slug>.md` (required)
- Optional: existing `TASKS.md` (this skill will reconcile, not blow away — see Reconciliation below)

## Procedure

### 1. Read the plan in full

Including the validation gates and pseudocode. If anything is ambiguous, STOP and tell the user the plan needs a `/plan` revision — do not paper over.

### 2. Re-read repo conventions

Glance at `AGENTS.md` (one-way rule, commands, conventions) and the touched layer's existing files. The atomic boundaries should follow the same patterns.

### 3. Decompose into atoms

An **atom** is the smallest unit that:
- Touches the fewest possible files
- Is independently reviewable
- Has a clear acceptance test
- Either succeeds completely or doesn't merge

Common atomic boundaries in this repo:
- One Angular component + its types + its spec
- One Tauri command (handler + types + tauri-specta export)
- One SQLite migration + its query layer functions
- One library scaffold (project.json + index.ts + one component)
- One CI / config change
- One end-to-end wiring across an existing layer (small)

**Anti-patterns** (split these):
- "Implement the whole shell" → split per panel
- "Add SQLite layer" → split per table or per query family
- "Wire up the agent loop" → split spawn / parse / persist / render

### 4. Order and parallelism

For each atom, set `dependencies` (atom IDs that must complete first) and `parallelizable` (true if it has no shared mutable files with any sibling at the same dependency depth).

### 5. Write `TASKS.md`

Use `.claude/templates/tasks_base.md`. Always at repo root (`./TASKS.md`). One section per atom, in dependency order. Atom IDs follow the milestone they belong to: `M3.1`, `M3.2`, … (use the milestone codes from `docs/mozart-implementation-flow.md`).

### 6. Reconciliation (if TASKS.md already exists)

- Preserve `[x]` checkmarks on completed atoms — never reset progress.
- If a completed atom's allowed-files list changes due to the new plan, mark the atom `STALE` and add a new atom that does the delta — don't rewrite history.
- Append new atoms; don't reorder completed ones.

### 7. Self-check

- Every atom has all required fields (no defaults).
- Every `forbidden_files` list is non-empty (the empty default is a smell — name something).
- Every dependency ID exists in the file.
- The dependency graph is acyclic.
- No atom touches more than ~5 files. If one does, split it.

### 8. Hand off

Report:
- Total atoms, how many parallelizable
- Critical path (longest dependency chain)
- Next step: `/implement` (which will start at the first unchecked atom)

## What this skill must NOT do

- No source edits beyond `TASKS.md`.
- No invoking `implementer`.
- No deciding *how* to implement — only *what units of work* exist. The "how" is in the plan.
- No silent merges with an existing TASKS.md — surface conflicts.
