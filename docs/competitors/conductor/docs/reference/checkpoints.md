---
title: Checkpoints
description: View turn by turn changes in a workspace and revert to previous turns
url: /docs/reference/checkpoints
site: www.conductor.build
---

# Checkpoints



Checkpoints are automatic snapshots of an agent's changes to your codebase. They show you what changed in the most recent turn and let you revert to previous turns.

## Restoring Checkpoints [#restoring-checkpoints]

To restore to a previous turn, hover over your message and click the revert icon.

Clicking the revert icon will **permanently delete** all user and AI messages from the selected turn and later. All code changes made since that user message was sent will also be reverted. Once the reversion is complete, the agent will have no knowledge of the changes or conversation you deleted.

## How Checkpoints Work [#how-checkpoints-work]

* Checkpoints are stored locally, separate from your working branch's Git history.
* Before each supported agent responds to a user message, Conductor captures the working branch state in a private Git ref.
* Each checkpoint therefore captures all AI and user code changes between when the previous and current user messages were sent.

Exercise caution when using checkpoints if multiple chats are running in the
same workspace.

 
