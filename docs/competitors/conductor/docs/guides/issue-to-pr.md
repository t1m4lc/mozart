---
title: From issue to PR
description: Take a GitHub or Linear issue through implementation, review, and pull request
url: /docs/guides/issue-to-pr
site: www.conductor.build
---

# From issue to PR



Use this guide when a GitHub or Linear issue should become a pull request.

This is the issue-specific version of the [Conductor workflow](/docs/concepts/workflow): start from issue context, let agents implement and verify the change in an isolated workspace, then use the branch and pull request to integrate the result.

## Decide the shape of the work [#decide-the-shape-of-the-work]

Before you create the workspace, decide whether the issue should become one pull request or several.

Use one workspace when the issue has one reviewable outcome, one branch, and one pull request.

Split the issue into multiple workspaces when it contains independent features, risky experiments, or changes that should be reviewed and merged separately.

For more detail on choosing between shared and separate workspaces, see [Parallel agents](/docs/concepts/parallel-agents).

## Start from an issue [#start-from-an-issue]

Create a workspace from the issue when you want the agent to inherit the issue title, description, and context.

1. Click the `...` button next to `New workspace`, or press Command + Shift + N.
2. Choose a GitHub issue or Linear issue.
3. Confirm the repository and workspace.
4. Wait for Conductor to create the workspace and branch.

If the issue does not appear, check GitHub or Linear authentication.

## Ask for a plan [#ask-for-a-plan]

Use Plan Mode when the issue is broad or ambiguous. Ask the agent to summarize the issue, inspect the relevant code, and propose an implementation plan before editing files.

Approve the plan when it matches the intended scope for this workspace. Give feedback if the plan misses requirements, tests, rollout constraints, or work that belongs in a separate workspace.

## Implement and test [#implement-and-test]

Let the agent make the change inside the isolated workspace, then test from that workspace:

1. Run the project with a [run script](/docs/reference/scripts/run), terminal command, or [Spotlight testing](/docs/reference/scripts/spotlight-testing).
2. Ask the agent to fix errors with logs or failing output attached.
3. Keep todos updated for work that must be complete before merge.

## Review the diff [#review-the-diff]

Open the Diff Viewer with Command + Shift + D.

Review:

* Whether the change solves the issue.
* Whether unrelated files changed.
* Whether tests or docs need updates.
* Whether comments or todos are still open.

Send review comments to the agent when you want it to revise the diff.

Use the [Checks tab](/docs/reference/checks) to watch git status, CI, deployments, comments, and todos. If there are conflicts, ask the agent to help resolve them, then rerun tests and review the diff again before creating or merging the pull request.

## Create the pull request [#create-the-pull-request]

When the workspace is ready, click `Create PR` or use Command + Shift + P. Conductor sends the current diff and repository context to the agent so it can draft the pull request.

After the PR exists, keep using the Checks tab and Diff Viewer to respond to CI, deployments, review comments, and todos.

## Merge and archive [#merge-and-archive]

Merge when checks pass, review comments are resolved, and todos are complete. Archive the workspace after merge so it leaves your active work list.

For more detail on the final review pass, see [Review and merge a workspace](/docs/guides/review-and-merge).

 
