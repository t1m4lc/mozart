---
title: Review and merge a workspace
description: Use Conductor's review, checks, and PR tools before merging
url: /docs/guides/review-and-merge
site: www.conductor.build
---

# Review and merge a workspace



Use this guide after an agent or teammate has changed code in a workspace.

## Review the diff [#review-the-diff]

Open the Diff Viewer with Command + Shift + D. Review the changed files before you ask Conductor to create or merge a pull request.

In the Diff Viewer, you can:

* Inspect file changes.
* Leave comments on changed lines.
* Send comments back to the agent.
* Resolve GitHub review threads when they no longer apply.
* Revert files when you do not want to keep a change.

## Ask for review [#ask-for-review]

Use the `Review` action when you want an agent to inspect the current diff. Add repository-specific review guidance in Repository Settings under `Code review preferences`.

Good review prompts are specific. Tell the agent what to prioritize, such as correctness, migration safety, UI regressions, tests, or security-sensitive behavior.

## Check merge readiness [#check-merge-readiness]

Open the Checks tab before you merge. It gathers the state that usually determines whether a workspace is ready:

* Git status
* Pull request metadata
* CI and status checks
* Deployments
* GitHub and review comments
* Todos

Treat unresolved comments, failing checks, and open todos as blockers until you intentionally clear them.

## Create or update the PR [#create-or-update-the-pr]

Use `Create PR` when the workspace is ready for review. Conductor sends the current diff and repository context to the agent so it can draft a pull request description.

If you already have a PR, use the Checks tab and Diff Viewer to keep responding to review comments and status changes.

## Merge and archive [#merge-and-archive]

Merge when the PR is approved, checks are green, comments are handled, and todos are complete. After merge, archive the workspace so it leaves your active work list.

If you need to revisit the work later, restore the workspace from the Workspaces page.

 
