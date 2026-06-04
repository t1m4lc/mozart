---
title: Big Terminal Mode
description: Use a full terminal in the center panel
url: /docs/reference/big-terminal-mode
site: www.conductor.build
---

# Big Terminal Mode



Big Terminal Mode replaces the center panel with a full terminal. Use it when you want a terminal-first workflow inside Conductor instead of launching only saved run scripts.

Open Big Terminal Mode with Command + Shift + T.

Enable Big Terminal Mode in `Settings` -> `Experimental`.

## Behavior [#behavior]

* Terminal sessions restore after restart.
* New terminals can use presets to start common commands or tools.
* Big Terminal Mode can run any agent or command available in your terminal environment.

## Agent presets [#agent-presets]

Big Terminal Mode is useful when you want to run an agent directly from a terminal. New terminal tabs can start from a preset so the agent command runs automatically.

| Preset | Command |
| --- | --- |
| Claude | `claude --dangerously-skip-permissions` |
| Codex | `codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access` |
| OpenCode | `opencode` |
| Amp | `amp` |
| Pi | `pi` |
| Copilot | `copilot --allow-all` |
| Gemini | `gemini -y` |
| None | No command |

For saved commands attached to the Run button, use [run scripts](/docs/reference/scripts/run).

## Demo [#demo]

 
