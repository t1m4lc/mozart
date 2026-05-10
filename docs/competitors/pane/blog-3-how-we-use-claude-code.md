# Blog: How We Use Claude Code at Dcouple

**Source:** https://runpane.com/blog/how-we-use-claude-code  
**Author:** Parsa (Dcouple Inc) · 2026-05-07

---

## Core Philosophy

> "We do not use Claude Code as a magic textbox. We use it as a member of a small software factory: one task, one plan, one worktree, one reviewable diff."

---

## The Loop

Most tasks: `/discussion` → `/plan` → `/implement`

- **Discussion** — force ambiguity into the open
- **Planning** — turn intent into file-level work
- **Implementation** — agent writes code, held to the plan

Sounds slower than prompting directly. It isn't. The expensive failures are not typing failures — they are wrong-shape failures: plausible code, weak intent, missing integration, no finish line.

---

## The .claude Directory Is Product Code

Not private ceremony. Part of how the product gets built.

- Commands define the workflow
- Agents split research, implementation, and review
- Plans preserve intent so implementation cannot quietly shrink the task
- Reviews check whether the work actually reached the user-facing path

---

## Worktrees Are the Unit of Parallelism

Running three agents in one checkout asks for confusion. Each agent needs:
- Its own branch
- Its own working directory
- Its own diff

The important part isn't that worktrees exist — it's that they're attached to the agent workflow. A bare worktree is just another path to remember.

---

## What They Don't Automate Away

They don't want an agent to disappear for hours and return with a giant diff to trust. They want:
- Small plans
- Visible terminals
- Reviewable diffs
- Human making the ship/no-ship call

This is also the product philosophy behind Pane itself.
