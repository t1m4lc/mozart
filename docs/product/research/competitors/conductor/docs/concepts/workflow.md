---
title: Workflow
description: How Conductor turns isolated workspace streams into reviewed pull requests
url: /docs/concepts/workflow
site: www.conductor.build
---

# Workflow



Conductor works best when each workspace represents one stream of work.

The workspace is the unit of delegation. The branch and pull request are the unit of integration.

Use this model after you have created your [first workspace](/docs/first-workspace). Break work into reviewable pieces, give each piece a workspace, then use Conductor's review, checks, pull request, and merge tools to bring finished branches back into the main codebase.




## Break down the problem [#break-down-the-problem]

Start by deciding what should be reviewed and merged together. A feature, bug fix, issue, experiment, or pull request usually gets its own workspace.

If a problem contains several independent changes, split it into smaller pieces first. Each piece should be clear enough for one agent or group of agents to own, test, review, and merge without waiting on unrelated work.

Use one workspace when the work needs one shared branch and code state. Use multiple workspaces when the pieces can move independently. For more detail, see [Parallel agents](/docs/concepts/parallel-agents).

## Create one workspace per shippable unit [#create-one-workspace-per-shippable-unit]

Create a workspace for each shippable unit of work. The workspace gets its own branch and working tree, so agents can change code, run commands, and build context without colliding with your main checkout or with other workspaces.

Use Command + Shift + N or the `...` button next to `New workspace` to create a workspace from a branch, pull request, GitHub issue, or Linear issue.

For first-time setup, see [Your first workspace](/docs/first-workspace). For the underlying workspace model, see [Isolated workspaces](/docs/concepts/workspaces-and-branches).

## Run agents independently [#run-agents-independently]

Use Claude Code or Codex directly in Conductor, or open the workspace in your IDE. Each workspace has its own files, branch, app processes, and agent context, so agents can work on separate streams at the same time.

For durable project guidance, use Repository Settings or checked-in instruction files. For task-specific context, use the chat, attachments, and `.context`.

When you start another independent feature, bug fix, or issue, create another workspace instead of waiting for the first agent to finish. Each workspace can run its own app process and reach review on its own schedule.

## Verify, review, and resolve conflicts [#verify-review-and-resolve-conflicts]

Use the terminal, Run button, or Spotlight testing to verify the workspace before it becomes a pull request.

Open the Diff Viewer with Command + Shift + D. Review changed files, leave comments, and ask an agent to address anything missing.

Start with a quick sanity check in the running app when possible, then review the code. Use the `Review` action for an agent review, and use the Diff Viewer for your manual review. Inline comments become composer attachments that you can send back to the agent that made the change.

Use the [Checks tab](/docs/reference/checks) to inspect git status, CI, deployments, comments, and todos before you merge. If the branch has conflicts, ask an agent to help resolve them, then rerun tests and review the diff again before continuing.

For a step-by-step final pass, see [Review and merge a workspace](/docs/guides/review-and-merge).

## Open the PR, merge, and archive [#open-the-pr-merge-and-archive]

Create a pull request with Command + Shift + P. Conductor can help draft the PR description, respond to review comments, fix failing checks, and prepare the branch for merge.

After the PR opens, Conductor follows the GitHub Actions and status checks for the branch. Merge when the PR is approved, checks are green, comments are resolved, and todos are complete.

Archive finished workspaces so your sidebar stays focused. You can restore archived workspaces from the Workspaces page, including their chat history.

To apply this flow to a GitHub or Linear issue, see [From issue to PR](/docs/guides/issue-to-pr).

 
