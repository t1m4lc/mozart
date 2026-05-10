---
name: implement
description: Executes TASKS.md one atom at a time with man-in-the-middle checkpoints. For each atom: pre-flight Q&A only if blocking → spawn implementer → run validation → review report → ask the user before committing → ask the user before moving to next atom. Never auto-chains atoms. Use after /atomize.
---

# /implement

The execution loop. Optimised for **small, reviewable diffs** and **no surprises mid-stream**. Every atom is a stop-and-confirm.

## Mode and effort

- **Do NOT enter plan mode** — this skill needs Edit/Write/Bash for staging and committing. Plan mode is wrong here.
- **Per-step thinking effort:**
  - Step 1 (pick atom): no extra thinking — it's lookup
  - Step 2 (pre-flight): `think hard` — deciding whether something is a real blocker vs noise is the failure-prone judgment
  - Step 4 (validation gate review): `think hard` when interpreting test failures
  - Step 5 (review checkpoint): `think hard` when summarising the diff for the user
  - Implementation work itself: delegated to the `implementer` agent (opus) — see that file
- **Bump to `think harder`** for any atom whose `allowed_files` includes both `apps/desktop/src-tauri/**` AND `apps/desktop/src/**` (Rust ↔ Angular boundary changes are where mistakes hide).

## Inputs

- `TASKS.md` at repo root (required, produced by `/atomize`)
- Optional: a specific atom ID to start from (e.g. `/implement M3.4`). Default: first unchecked atom in dependency-order.

## The per-atom loop

For ONE atom (never auto-advance):

### Step 1 — Pick the atom

- Read `TASKS.md`
- Find the first unchecked atom whose `dependencies` are all `[x]`
- If user passed an atom ID, jump there (and warn if its deps aren't met)
- Print the atom block to the user verbatim — they should see exactly what's about to happen

### Step 2 — Pre-flight (BLOCKING questions only)

Read the atom's allowed files. Read each dependency atom's commit (look at git log for the SHA, then diff). Identify:

- **Genuine ambiguity** the atom doesn't resolve (e.g. acceptance criterion mentions "empty state styling" but the plan doesn't specify which token)
- **Discovered conflict** with current code (e.g. an allowed file was modified by a recent commit in a way the atom didn't anticipate)
- **Missing prerequisite** (e.g. a dependency atom was supposedly completed but the file it should have produced doesn't exist)

If ANY of the above: ask the user. Use `AskUserQuestion` for choices, prose for open. **Do NOT pre-emptively ask "any concerns?"** — only ask when there's a concrete blocker.

If no blockers: tell the user "No blockers — implementing M3.4 now" and proceed.

### Step 3 — Implement (delegate)

Spawn the `implementer` subagent with:
- Atom ID
- Atom block (pasted verbatim)
- Pointer to the parent plan in `tmp/ready-plans/`

Wait for its report.

### Step 4 — Validation gate

After the implementer returns, independently verify (don't trust the report blindly):
- Run the atom's `tests/checks` block again from the parent context.
- Check `git status` shows ONLY files in `allowed_files` (no surprise edits).
- Skim the diff for: comments that violate house style, dead code, accidental imports outside `@mozart/*`.

If validation fails: report to user, ask whether to retry the implementer with feedback, abandon, or split the atom.

### Step 5 — Review checkpoint (man in the middle)

Show the user:
- Files changed (count + paths)
- Diff size (`+X / −Y`)
- Validation outcome
- Acceptance criteria status (each checked or noted)
- Anything in the implementer's "Notes for the parent skill"

Then ASK:

> Atom M3.4 ready. Commit as `feat(M3): <subject>`?  
> Options: **Commit**, **Amend** (give feedback, retry), **Skip commit** (leave staged), **Abort** (revert)

Use `AskUserQuestion`. Wait.

### Step 6 — Commit (if user said Commit)

- Stage ONLY the files in `allowed_files` (`git add <each>` explicitly — never `git add .`, the hook will block it anyway)
- Commit with `feat(M{N}): <atom subject>` (or `fix(...)` / `chore(...)` per atom type)
- Hooks may run; if they fix formatting, re-stage and re-commit (NEVER `--no-verify`, NEVER `--amend` after a hook failure — make a new commit)
- Update `TASKS.md`: change `[ ]` to `[x]` on the atom line, add the commit SHA at the end of the atom block

### Step 7 — Continue checkpoint (man in the middle, again)

ASK:

> Atom M3.4 committed (`<sha>`). Next eligible atom: **M3.5 — <subject>**.  
> Options: **Continue to M3.5**, **Pause here**, **Skip to a different atom**, **Stop /implement**

Use `AskUserQuestion`. Wait.

If "Continue": go back to Step 1 with the next atom.  
If anything else: report state and exit cleanly.

## Hard rules

- **One atom per loop.** Never silently advance. The Step 5 and Step 7 prompts are not optional.
- **Never modify outside `allowed_files`.** If the implementer crossed the boundary, revert and re-prompt with the violation noted.
- **Never `git add .`** (the hook blocks it; don't try).
- **Never `git push` or `--force`-anything.** This skill writes commits locally only.
- **Never skip the validation gate** — even if the implementer says it passed.
- **Never edit `TASKS.md` atoms that are already `[x]`.** If you find one is wrong, surface it; don't fix it silently.

## When the plan moves to done

When the LAST atom of a plan is committed (every atom in the plan is `[x]`):
- Move the plan: `tmp/ready-plans/<file>.md` → `tmp/done-plans/<file>.md`
- **Sync `docs/TODO.md`** (see below)
- Note in the user-facing message: "Plan `<name>` complete. `<N>` atoms, `<N>` commits. TODO.md updated."

### TODO.md sync (master strategic checklist)

`docs/TODO.md` is the human-maintained master plan (Phase 0 / Phase 1 M1–M9 / Phase 2 M10–M13). Skills do NOT manage TODO.md mid-flight, but `/implement` reconciles when a whole plan completes.

Procedure (only at plan-done time):

1. Read the plan's frontmatter / `Spec source` line. It points to a section of `docs/PLAN-v0.0.1.md` (e.g. "Step 1.4") or `docs/mozart-implementation-flow.md` (e.g. "M5"), or `.context/context.md`.
2. Grep `docs/TODO.md` for matching unchecked items:
   - PLAN.md Step `1.X` → look for the section header containing `1.X` or the equivalent `M{N}` mapping (TODO.md uses M1–M13 numbering; see `docs/mozart-implementation-flow.md` for the canonical map).
   - If multiple TODO items match (e.g. `M3` has 7 sub-checkboxes), tick only the ones whose subject matches an atom that was completed in this plan.
3. Update with `Edit`: change `- [ ]` to `- [x]` for each matched line. Add the date inline: `- [x] M3.4 — Tauri window config (2026-05-10)`.
4. **Show the user the diff before committing.** Use `AskUserQuestion`:
   > Mark these TODO.md items as done?  
   > Options: **Yes — commit**, **Edit selection** (you pick which ones), **Skip TODO.md update**
5. If "Yes": stage `docs/TODO.md` and commit with message `chore(docs): sync TODO.md after plan <plan-slug>`.

Rules:
- **Never tick TODO.md mid-plan.** Only when the whole plan is done.
- **Never invent a match.** If you can't find a clear corresponding TODO line, ask the user — don't guess.
- **Never untick a `[x]`.** If the user did manual progress tracking, respect it.
- **Never reformat TODO.md.** Edits are surgical: tick + date suffix, nothing else.

## What this skill must NOT do

- No re-planning. If the atom turns out to be wrong, abort and tell the user to revise the plan.
- No spawning multiple `implementer` instances in parallel. Sequential, with a checkpoint between each.
- No PR creation, no push, no rebase, no squash. (Future `/prepare-pr` or your existing `/ship` will own that.)
