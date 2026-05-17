---
description: Open a Project, write a Task, run an Agent, review the Changes.
order: 3
---

This walkthrough takes you from an empty Mozart window to a reviewed diff. It assumes the desktop app is installed and a Claude account is connected.

## Open a Project

A Project is a Git repository. Pick **Open Project** from the Mozart sidebar and select a folder on disk. Mozart reads the repo state — nothing is pushed anywhere.

## Write a Task

A Task is your intent in plain English. Examples:

- "Add a search input to the navbar"
- "Fix the failing test in `payments.spec.ts`"
- "Refactor `UserService` to use signals"

Keep it specific. The Agent runs against this exact wording.

## Run the Workspace

Click **Run**. Mozart creates an isolated Workspace for this Task and starts an Agent Run inside it. You can watch the Agent stream its work in the Thread on the right.

## Review the Changes

When the Agent stops, open the **Changes** tab. You see a side-by-side diff of every file the Workspace touched. Approve, request edits in the Thread, or discard.

## Commit

Once you are happy, click **Commit**. Mozart writes a clean commit on a branch named after your Task. From there it is regular Git — push, open a PR, merge.

## Next

Learn the [vocabulary](/docs/concepts/isolated-workspaces) Mozart uses for these pieces.
