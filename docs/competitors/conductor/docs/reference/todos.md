---
title: Todos
description: Track merge-blocking work in a workspace
url: /docs/reference/todos
site: www.conductor.build
---

# Todos

Todos track work that must be finished before a workspace merges.

## How todos work [#how-todos-work]

The todos section shows what still needs to happen before merge. You can add your own todos, and agents can use todos to organize longer tasks.

Workspaces are blocked until todos are checked off, so known unfinished work does not merge by accident.

## Send todos to the agent [#send-todos-to-the-agent]

Mention `@todos` in the composer when you want the agent to see the current todo list.

## When to clear todos [#when-to-clear-todos]

Clear a todo only when the work is complete or no longer applies. If a todo is no longer relevant, remove it instead of checking it off as completed.
