---
description: From install to a reviewed diff in five steps.
order: 3
---

This is the fastest path from a fresh install to your first reviewed diff. Each step links to the
detail if you want to go deeper — you don't need any of it to get started.

## 1. Install Mozart

Download and launch the desktop app. See [Install](/docs/install) for system requirements.

## 2. Connect your agent

Mozart runs Claude Code under the hood, so it needs a Claude account. On first launch Mozart walks
you through connecting it — sign in once and every Workspace uses it.

## 3. Open or create a Project

A Project is a Git repository. From the sidebar, **Open Project** to pick a folder on disk, or
create a new one from an empty folder — Mozart runs `git init` and registers it. Either way your
code stays [local](/docs/concepts/local-first); nothing is pushed anywhere.

## 4. Run your first Workspace

Write a **Task** — your intent in plain English, like *"Add a search input to the navbar"* — and
click **Run**. Mozart spins up an isolated [Workspace](/docs/concepts/isolated-workspaces) and
streams the Agent's work live in the Thread.

## 5. Review and commit

When the Agent stops, open **Changes** for a side-by-side diff of everything the Workspace touched.
Approve it, ask for edits in the Thread, or discard. When you're happy, **Commit** — from there
it's regular Git: push, open a PR, merge.

That's the core of Mozart: every Task gets its own isolated Workspace and a diff you review like a
PR. Run several against the same Task and keep the one you like best.

## Next

Learn the [vocabulary](/docs/concepts/isolated-workspaces) behind these pieces.
