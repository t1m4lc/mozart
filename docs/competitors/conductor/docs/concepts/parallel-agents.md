---
title: Parallel agents
description: Choose when to split work across workspaces or inside one workspace
url: /docs/concepts/parallel-agents
site: www.conductor.build
---

# Parallel agents

Parallel agent work starts with one decisio n: should these agents share a workspace, or should they move independently?

Use multiple workspaces when tasks should land independently. Use multiple agents in one workspace when the work shares the same branch, code state, and context.




## Use multiple workspaces for independent work [#use-multiple-workspaces-for-independent-work]

Create a new workspace with Command + N when work should have its own branch, files, running environment, and review path.

This is the default choice for:

* Independent features.
* Bug fixes that can ship separately.
* GitHub issues, Linear issues, or pull requests.
* Experiments you may discard.
* Tasks that need separate app processes or test runs.

Each workspace gives the agent a separate branch and working tree. That lets you run, review, merge, or archive each stream of work on its own schedule.

## Use one workspace for shared work [#use-one-workspace-for-shared-work]

Run multiple agents in one workspace when the work belongs on the same branch and should share the same files and context.

This works well for:

* One agent implementing while another reviews the same diff.
* One agent fixing tests after another changes the code.
* Frontend and backend changes that must land together.
* Comparing approaches before choosing one path.
* Multi-agent review of one branch before opening a pull request.

The tradeoff is that agents in the same workspace can edit the same files. Use this when shared context matters more than separation.

## Decision guide [#decision-guide]

| Task shape | Use | Why |
| --- | --- | --- |
| Two features can ship separately | Multiple workspaces | Each gets its own branch, app state, and PR path. |
| One feature needs implementation and test repair | One workspace | The agents need the same branch and latest changes. |
| Several issues should be explored in parallel | Multiple workspaces | You can archive, merge, or discard each result independently. |
| One branch needs a second opinion | One workspace | Review comments should apply to the same diff. |
| A risky experiment may be thrown away | Multiple workspaces | The experiment stays isolated from ongoing work. |

## Common patterns [#common-patterns]

For a review, fix, and test split, keep the agents in one workspace. They are collaborating on the same branch, so one agent can review the diff while another applies fixes and a third runs or repairs tests.

For issue fanout, use multiple workspaces. Create one workspace per GitHub or Linear issue, give each agent the relevant context, then review and merge the branches that are worth keeping.

For exploratory work, start with multiple workspaces if the branches may diverge. If you choose one path, archive the others or copy the useful context into the winning workspace.

For the underlying workspace model, see [Isolated workspaces](/docs/concepts/workspaces-and-branches).

 
