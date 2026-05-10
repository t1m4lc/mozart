---
title: Agent modes
description: Understand Plan Mode, Fast Mode, reasoning controls, and agent-specific session controls
url: /docs/concepts/agent-modes
site: www.conductor.build
---

# Agent modes



Conductor lets you change how an agent approaches a task before or during a chat. These controls affect the current session, not the repository itself.

Use Claude Code or Codex when you want a coding agent in a Conductor workspace. You can run one agent by itself, or run Claude Code and Codex in separate tabs or workspaces.

## Supported controls [#supported-controls]

| Control | Claude Code | Codex |
| --- | --- | --- |
| Plan Mode | Supported | Supported |
| Fast Mode | Supported | Supported |
| Thinking or reasoning level | Supported when the selected model exposes it | Supported when the selected model exposes it |
| Personalities | Not supported | Supported |
| Checkpoints | Supported | Supported |
| Skills | Supported | Supported |

Open the model picker to choose a Claude Code or Codex model. If Codex cannot start, check your OpenAI authentication or subscription setup.

## Plan Mode [#plan-mode]

Plan Mode asks the agent to make a plan before editing files. Use it when the task is ambiguous, risky, or broad enough that you want to review the approach first.

Plan Mode is useful for:

* Refactors with unclear boundaries
* Migrations
* Multi-file product changes
* Debugging where the root cause is not known yet
* Work that should be split across multiple agents or workspaces

When the plan looks right, approve it or give feedback. If you exit Plan Mode, the agent can move from planning into implementation.

## Fast Mode [#fast-mode]

Fast Mode prioritizes speed. Use it for narrow edits, simple fixes, and quick follow-up work.

Avoid Fast Mode when the task needs careful codebase analysis, large refactors, or high-stakes reasoning.

## Thinking and reasoning controls [#thinking-and-reasoning-controls]

Some models expose thinking or reasoning controls. Higher settings give the agent more room to reason before answering, but may take longer or use more credits.

Use higher reasoning for architecture, debugging, migrations, and code review. Use lower reasoning for straightforward edits and short questions.

## Codex personalities [#codex-personalities]

Codex sessions can use personalities to change how Codex approaches work. Personalities are session-level controls. Use them when you want a different working style without changing repository instructions.

## Skills [#skills]

Codex and Claude Code can use skills in Conductor. If you already have repo or user skills for one agent, you can often reuse them so both agents follow the same project conventions.




## Run agents together [#run-agents-together]

Use separate tabs when you want Claude Code and Codex to work in the same workspace. Use separate workspaces when the work should happen on different branches.

## Repository guidance [#repository-guidance]

Mode controls are temporary. For durable guidance, use Repository Settings or checked-in instruction files such as `AGENTS.md`, `CLAUDE.md`, or skills.

 
