---
title: Slash commands
description: Reusable prompt commands for agent chats
url: /docs/reference/slash-commands
site: www.conductor.build
---

# Slash commands

Slash commands are reusable prompts stored as Markdown files. Use them for prompts your team runs often, such as review checklists, release steps, or debugging workflows.

## Command location [#command-location]

Create custom commands in `.claude/commands/`. They appear in the chat composer when you type `/`:

```bash
mkdir -p ~/.claude/commands
echo "Your prompt here" > ~/.claude/commands/<name>.md
```

The file name becomes the slash command name.

## Good commands [#good-commands]

Good slash commands are specific and reusable. Include the role, the task, the expected output, and any constraints the agent should follow.

## Learn more [#learn-more]

For Claude Code command behavior, see the [Claude Code slash command docs](https://docs.anthropic.com/en/docs/claude-code/slash-commands).
