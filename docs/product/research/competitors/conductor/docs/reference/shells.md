---
title: Shell configuration
description: Configure shell setup
url: /docs/reference/shells
site: www.conductor.build
---

# Shell configuration



Conductor uses your login shell environment to run setup scripts, run scripts, terminals, and agents. We try to make your environment work out of the box, the same way it would work in your terminal.

To do this, Conductor launches an interactive login shell in each workspace to capture environment variables which will be reused later. (We use the workspace directory because tools like `mise` can change their behavior depending on the current directory.)

Although Conductor captures your shell environment using your login shell (`$SHELL`), it runs most commands—including your setup and run scripts—using `zsh`.

## Common issues [#common-issues]

If your shell configuration (e.g., `.zshrc` or `.zshenv`) is slow or contains errors, Conductor may fail to launch agents or run commands.

Possible causes include

* Interactivity: if shell startup tries to read input, it will hang inside Conductor's non-interactive environment
* Slowness: Conductor gives your shell configuration 5 seconds to load. If it doesn't load within that time, it will abort.

To check how long the shell takes to start, run:

```bash
time "$SHELL" -ilc env
```

## Put setup directly in your script [#put-setup-directly-in-your-script]

Where possible, add required setup to your Conductor setup or run script so the command does not depend on interactive shell configuration.

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
eval "$(mise activate zsh)"
pnpm install
```

This makes the script easier to understand, share, and debug because the required environment setup lives next to the command that needs it.

## Put minimal shared setup in .zshenv [#put-minimal-shared-setup-in-zshenv]

Use `.zshenv` when configuration must be available to every zsh script, including non-interactive scripts.

Keep `.zshenv` minimal. Avoid prompts, slow commands, terminal UI setup, or anything that assumes an interactive terminal.

When reliability matters most, put setup directly into your scripts. Conductor tries to capture your interactive shell environment, but that capture can fail, time out, or become stale.

 
