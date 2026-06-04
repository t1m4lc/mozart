---
title: Your first workspace
description: Import a repository, configure it, and start agent work in an isolated Conductor workspace
url: /docs/first-workspace
site: www.conductor.build
---

# Your first workspace



A workspace is an isolated, git-backed copy of your project for one task.

Use this page to add a repository, get the workspace runnable, give an agent enough context, and review the result.

Conductor workspaces isolate development state, not system permissions.
Agents and commands still run locally with your user permissions.

## Add a repository [#add-a-repository]

Once you've [installed Conductor](/docs/installation), add a repository by selecting one of the following options:

* **Open project**: choose an existing local repository.
* **Open GitHub project**: choose a repository from GitHub.
* **Quick start**: create a new repository from Conductor.

Conductor uses GitHub from your terminal environment. To confirm GitHub is
available, run `gh auth status` in your terminal.

## Create the workspace [#create-the-workspace]

After you add a repository, Conductor creates a workspace for it.




Each workspace has its own:

* Branch.
* Working tree.
* Setup and run context.

Conductor copies files tracked by Git into the workspace. Ignored files, dependencies, local databases, and `.env` files come from your setup script or your project's own setup workflow.

For the underlying model, see [Isolated workspaces](/docs/concepts/workspaces-and-branches).

## Make it runnable [#make-it-runnable]

Before agents start changing code, make sure each workspace can install dependencies, read local config, and run the project.

Use a [setup script](/docs/reference/scripts/setup) for files and dependencies that Git does not track, such as `.env` files, local databases, generated files, and package installs.

Use a [run script](/docs/reference/scripts/run) to launch your app, server, watcher, or tests from Conductor. Run scripts execute inside the workspace directory and can use `CONDUCTOR_PORT`, so multiple workspaces can run beside each other.

You can manage scripts in Repository Settings or share them with your team in [`conductor.json`](/docs/reference/conductor-json).

## Start work [#start-work]

Start a chat with Claude Code or Codex in Conductor. For a simple task, use one agent in one workspace.

Before you ask for changes, attach the context the agent needs:

* Mention files, folders, or comments from the composer.
* Attach notes, specs, screenshots, and logs.
* Put uncommitted handoffs in `.context`.

Use the Run button for saved commands and the terminal for one-off commands. Commands run inside the workspace, not your original checkout. If your app cannot run cleanly from a workspace directory, use [Spotlight testing](/docs/reference/scripts/spotlight-testing).

## Split work deliberately [#split-work-deliberately]

Use multiple agents in the same workspace when they should share the same branch and code state, such as one agent implementing while another reviews or fixes tests. Use separate workspaces when tasks should move independently.

Create more workspaces with Command + Shift + N or the `...` button next to `New workspace`. You can start from a branch, pull request, GitHub issue, or Linear issue.

## Review, merge, and archive [#review-merge-and-archive]

When the workspace is ready:

1. Open the Diff Viewer with Command + Shift + D.
2. Run tests through the terminal, Run button, or Spotlight testing.
3. Open the Checks tab to review git status, CI, deployments, comments, and todos.
4. Create a pull request, merge when ready, and archive the workspace.

Next, learn the full [Conductor workflow](/docs/concepts/workflow) and when to use [parallel agents](/docs/concepts/parallel-agents).

 
