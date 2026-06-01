---
description: Your code stays on your machine. The cloud is opt-in, not default.
order: 2
---

Mozart runs as a desktop app and reads your code from disk. Tasks, Workspaces, Agent Runs, and Changes all execute locally. Nothing is uploaded unless you ask.

## What stays local

- Your Project files and Git history
- Workspaces and their diffs
- Threads with the Agent
- Mozart settings and preferences

## What goes to the network

Two things only:

1. **Agent calls** — the Agent sends prompts and code excerpts to its model provider (Claude). This is the same traffic you would generate using Claude Code directly.
2. **App updates** — Mozart checks for new versions on launch. You can disable this in Settings.

That is all. Mozart does not telemeter your code, your file paths, or your Tasks.

## The future cloud companion

`app.mozart.build` is a separate, opt-in surface for teams that want shared dashboards, deployed Tasks, or remote runs. It is not required to use Mozart and the desktop app works fully offline against your local Projects.

## Why this matters

Local-first means:

- You can use Mozart on private repos without a security review
- Your work survives if a vendor disappears
- You stay in control of what leaves your machine
