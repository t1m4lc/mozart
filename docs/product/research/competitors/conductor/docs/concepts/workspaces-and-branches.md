---
title: Isolated workspaces
description: Understand projects, repositories, workspaces, branches, working trees, and running environments
url: /docs/concepts/workspaces-and-branches
site: www.conductor.build
---

# Isolated workspaces



An isolated workspace is a separate, git-backed copy of a project for one stream of work.

Conductor uses workspaces so agents can change code, run commands, and build context without colliding with your main checkout or with agents working in other workspaces.

## The core model [#the-core-model]

These terms build on each other from the Conductor project down to the files and processes inside one workspace:

| Term | What it means in Conductor | Relationship |
| --- | --- | --- |
| Project | The Conductor entry for a codebase. It holds Repository Settings, scripts, instructions, and the list of workspaces for that codebase. | 1 project contains 1 repository |
| Repository | The Git codebase behind a project. It can come from an existing local folder, GitHub project, or Quick start. | 1 repository contains many workspaces |
| Workspace | An isolated copy of a project and repository for one task, issue, experiment, or pull request. | 1 workspace maps to 1 branch |
| Branch | The Git branch checked out inside a workspace. This is usually the review and PR unit. | 1 branch has 1 working tree |
| Working tree | The files on disk for one workspace. Each workspace has its own working tree. | 1 working tree belongs to 1 workspace |
| Running environment | The app, server, watchers, tests, and terminal commands running inside a workspace. | 1 workspace can run many processes |

The easiest way to identify a workspace is often by its branch. For instance, this workspace is on the `scroll-to-bottom-btn` branch:




The secondary name, such as `warsaw-v2`, is the workspace directory name.

## What isolation gives you [#what-isolation-gives-you]

Each workspace gives an agent a separate place to work:

* Code changes stay on that workspace's branch.
* File edits happen in that workspace's working tree.
* Setup and run scripts execute from that workspace directory.
* App processes can use workspace-specific environment variables such as `CONDUCTOR_PORT`.
* Notes and handoffs can live in the workspace's `.context` folder without being committed.

This is why Conductor works well for parallel agent work. You can put independent tasks in independent workspaces, run each one, review each branch, and merge work when it is ready.

Workspace isolation is development isolation, not a security boundary.
Agents and commands still run on your Mac with your user permissions.

## Branches and review [#branches-and-review]

Conductor wraps common GitHub and branch tasks in the app UI, but the branch is still the core unit that explains what a workspace is and how it fits into review and PR flow.




When you create a new workspace, Conductor will create a new branch for it. When you start your first chat, Conductor will instruct the agent to rename this branch to match what you're working on.

## Switching branches [#switching-branches]

If what you're working on changes, you can check out a different branch:

```sh
git checkout some-other-feature
```

...or rename the current branch:

```sh
git branch -m new-name
```

...or create a new branch:

```sh
git checkout -b new-branch
```

## Starting from an existing branch [#starting-from-an-existing-branch]

If you have an existing branch and you want to start a new workspace from it, you can follow these steps:

1. Use Command + Shift + N or click the `...` icon next to the "New workspace" button
2. Choose the "Branches" tab and select a branch

You could also create a new workspace and then switch to the branch you want using the instructions in the "Switching branches" section above.

## One workspace per branch [#one-workspace-per-branch]

A branch can only be checked out in one workspace at a time.

If you want to check out the `scroll-to-bottom-btn` branch in `tokyo`, but you already have
that branch checked out in `warsaw`, try one of these:

* In `tokyo`, run `git checkout -b scroll-to-bottom-btn-2 scroll-to-bottom-btn` to create a new branch based off of `scroll-to-bottom-btn`
* In `warsaw`, switch to any other branch (e.g., `git checkout -b dummy`), then in `tokyo` run `git checkout scroll-to-bottom-btn`

## Where to go next [#where-to-go-next]

Create your [first workspace](/docs/first-workspace), then use [Parallel agents](/docs/concepts/parallel-agents) to decide whether work belongs in one workspace or across several workspaces.

 
