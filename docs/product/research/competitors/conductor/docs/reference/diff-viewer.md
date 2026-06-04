---
title: Diff viewer
description: Review workspace changes, comments, and PR-ready diffs
url: /docs/reference/diff-viewer
site: www.conductor.build
---

# Diff viewer



The Diff Viewer shows the code changes in a workspace. Use it before creating a pull request, after an agent makes changes, and whenever review comments need another pass.




## What to review [#what-to-review]

Check the diff for:

* Files changed by the agent.
* Unrelated or accidental edits.
* Missing tests or docs.
* Local comments and GitHub review comments.
* Conflicts or files that need manual inspection.

Use the file list to move between changed files. If you are reviewing from a summary, comment, or search result, jump directly to the file before leaving feedback.

Change the diff view when it helps review:

* Use unified diff when you want the old and new code in one column.
* Use commit filtering when you need to review one commit at a time.

## Comments [#comments]

Use comments when you want to send specific feedback back to the agent. Comments can point at changed lines, so the agent gets more precise context than it would from a general chat message.

GitHub review comments can also appear in Conductor. When a thread is handled, resolve it so the Checks tab reflects the current review state.

## PR actions [#pr-actions]

Conductor recommends actions as a workspace moves toward merge.

Use those actions to create a pull request, respond to feedback, fix checks, and merge when the workspace is ready. When the suggested action is `Create PR`, Conductor walks you through turning the current workspace changes into a pull request.

For a step-by-step review flow, see [Review and merge a workspace](/docs/guides/review-and-merge).

 
