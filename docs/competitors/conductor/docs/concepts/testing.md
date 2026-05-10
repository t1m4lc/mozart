---
title: Testing
description: Automate testing in Conductor
url: /docs/concepts/testing
site: www.conductor.build
---

# Testing



After you make changes in a workspace, test them with either a run script or Spotlight testing.

Run scripts test from the workspace directory. Spotlight testing syncs one workspace back to the repository root and tests from there.

## Run scripts [#run-scripts]

Use a run script to launch your web server, app, test watcher, or unit tests from the Run button in Conductor's workspace toolbar.

Run scripts execute in the workspace directory. They can use `$CONDUCTOR_PORT`, so multiple workspaces can run their own copy of the app without fighting for the same port.

For setup details, see [Run script reference](/docs/reference/scripts/run).

## Spotlight testing [#spotlight-testing]

Use Spotlight testing when your project needs to run from the repository root instead of the workspace directory. Enable it in `Settings` -> `Experimental`, then use the Spotlight button from the workspace toolbar.

When Spotlight is on, Conductor syncs tracked workspace changes back to the repository root and opens a terminal there. Spotlight testing is experimental; enable it under `Settings` -> `Experimental`.

For when to use Spotlight instead of a run script, see [Spotlight testing](/docs/reference/scripts/spotlight-testing).

## Running microservices at once [#running-microservices-at-once]

Conductor only supports automating testing one service at a time. If your application requires microservices to be tested at once, see [Linking multiple directories](/docs/guides/repositories/linking-multiple-directories).

 
