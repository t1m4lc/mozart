---
title: Checks
description: Reference for merge readiness signals in a workspace
url: /docs/reference/checks
site: www.conductor.build
---

# Checks



The Checks tab collects the state you need before merging a workspace.

## What it shows [#what-it-shows]

Checks may include:

* Git status
* Pull request metadata
* CI and status checks
* Deployments
* GitHub comments and review threads
* Todos

The available sections depend on the repository, whether a pull request exists, and which integrations are connected.

## How to use it [#how-to-use-it]

Use the Checks tab as the last review pass before merge:

1. Confirm the branch has the changes you expect.
2. Open or update the pull request.
3. Fix failing checks.
4. Send unresolved comments to the agent or resolve them yourself.
5. Complete todos.
6. Merge when the workspace is ready.

## Blockers [#blockers]

Conductor may block or discourage merge actions when required work is still open, such as unresolved todos or failed checks. Treat these as prompts to inspect the workspace before merging.

For the full workflow, see [Review and merge a workspace](/docs/guides/review-and-merge).

 
