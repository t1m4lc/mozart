---
description: How Mozart keeps parallel Agent Runs from stepping on each other.
order: 1
---

A Workspace is an isolated execution attempt at a Task. Each Workspace has its own copy of your code, its own Agent Run, and its own reviewable diff. You can run several Workspaces against the same Task and pick the one you like.

## Why isolation matters

Agents are good at coding, but they are not careful about each other. If two Agents edit the same files at the same time, you get a mess. Mozart sidesteps this by giving every Agent its own Workspace — separate filesystem, separate execution, separate result.

## What a Workspace contains

Every Workspace ties together:

- A snapshot of the Project at the moment the Task started
- The Thread of messages between you and the Agent
- The Agent Run that produced the Changes
- The diff you review before committing

Nothing leaks across Workspaces unless you explicitly merge.

## Running attempts in parallel

You can start the same Task in two or three Workspaces at once. Each Workspace runs an independent Agent Run. When they finish, you compare the diffs side by side and merge the one that solved the problem best.

This is useful when:

- You want to A/B different approaches
- The Task is risky and you want a fallback
- The first run got stuck and you want a fresh attempt

## Lifecycle

A Workspace is cheap. Create as many as you need, throw away the ones that did not work. Mozart cleans up the underlying filesystem when you discard a Workspace.

## Next

See the [local-first principles](/docs/concepts/local-first) that make this safe.
