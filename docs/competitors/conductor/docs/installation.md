---
title: Install
description: Get Conductor running on your Mac
url: /docs/installation
site: www.conductor.build
---

# Install



Conductor is available for macOS. Install the app, then let Conductor check your setup.

## Download for Mac [#download-for-mac]

1. Press `D` or click `Download Conductor`.
2. Drag the Conductor app to your Applications folder.
3. Open Conductor.

Conductor is not available for Windows or Linux yet. [Sign up
here](https://docs.google.com/forms/d/1jPQsC8oLNIyjHW3WOsUxK2XNm0Z-BAzdooZuMs9cbFM/viewform)
and we'll let you know when it is ready.

## Setup checks [#setup-checks]

When you open Conductor, it checks that your Mac has what it needs to create workspaces and run agents. If anything is missing, Conductor walks you through setup.

Conductor checks for:

* GitHub authentication in your terminal environment. To check manually, run `gh auth status`.
* Claude Code login, if you plan to use Claude. To sign in manually, run `claude /login`.
* Codex login, if you plan to use Codex. To sign in manually, run `codex login`.

You need GitHub and at least one agent provider to use Conductor.

## Next step [#next-step]

After Conductor confirms your setup, create [your first workspace](/docs/first-workspace).

 
