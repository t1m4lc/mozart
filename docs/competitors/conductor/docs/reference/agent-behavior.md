---
title: Agent behavior
description: Reference for agent instructions, modes, permissions, and checkpoints
url: /docs/reference/agent-behavior
site: www.conductor.build
---

# Agent behavior



This page summarizes the controls that affect how agents behave in Conductor.

## Session controls [#session-controls]

| Control | Scope | Use it for |
| --- | --- | --- |
| Plan Mode | Current session | Ask the agent to plan before editing |
| Fast Mode | Current session | Trade extra credits for faster work where supported |
| Thinking or reasoning level | Current session | Adjust how much reasoning the model spends |
| Codex personality | Codex session | Choose a Codex working style |
| Checkpoints | Session/workspace | Revert code and chat state to an earlier turn |

For conceptual guidance, see [Agent modes](/docs/concepts/agent-modes).

## Repository instructions [#repository-instructions]

Use repository instructions for guidance that should apply repeatedly:

* `General preferences` apply broad instructions to agents in a repository.
* `Code review preferences` are sent when you click `Review`.
* `Create PR preferences` are sent when you create a pull request.
* `Fix errors preferences` are sent when Conductor asks an agent to fix errors.
* `Resolve conflicts preferences` are sent when an agent helps with merge conflicts.
* `Branch rename preferences` guide automatic branch naming.

These preferences live in Repository Settings.

## Instruction files and skills [#instruction-files-and-skills]

Agents can also use instructions stored in your repository or user configuration, such as:

* `AGENTS.md`
* `CLAUDE.md`
* `.claude/commands`
* Skills

Keep durable project conventions in these files. Keep task-specific details in the chat or `.context`.

## Permissions [#permissions]

Agents run locally and can use the same local permissions as your user account unless you configure stricter controls. Some actions may ask for approval before the agent continues.

For security details, see [Security and permissions](/docs/reference/security-and-permissions).

 
