---
description: Your personal, machine-wide preferences in settings.json.
order: 1
---

Global settings are **your** preferences, stored once on your machine and applied to **every**
Project you open — unless a [Project](/docs/reference/project-settings) overrides them. Use them for
anything that's about your taste or your machine, not about a specific repo: theme, notifications,
your default Agent model.

## Where the file lives

The global `settings.json` follows your operating system's conventions, under the app id
`build.mozart.desktop`:

| OS | Global `settings.json` |
|----|------------------------|
| macOS | `~/Library/Application Support/build.mozart.desktop/settings.json` |
| Linux | `~/.config/build.mozart.desktop/settings.json` (honors `$XDG_CONFIG_HOME`) |
| Windows | `%APPDATA%\build.mozart.desktop\settings.json` |

You don't have to create it by hand — Mozart writes it as you change preferences in the app. Edit
it directly only if you prefer to.

## What you can set

Every key is optional; anything you omit falls back to the bundled default.

| Key | Type | Default | What it does |
|-----|------|---------|--------------|
| `appearance.theme` | string | `"mozart"` | Theme name from the catalog. |
| `appearance.colorMode` | enum | `"system"` | `light` / `dark` / `system`. |
| `notifications.desktop` | bool | `true` | OS notification when a turn ends and Mozart isn't focused. |
| `notifications.sound` | bool | `true` | Play the end-of-turn chime. |
| `timeline.density` | enum | `"normal"` | `compact` / `normal` / `detailed`. |
| `agent.model` | string \| null | `null` | Default model for new chats; `null` = the app's current default. |
| `agent.mode` | enum | `"agent"` | `agent` / `plan` / `ask`. |
| `agent.effort` | enum | `"medium"` | `low` / `medium` / `high` / `xhigh` / `max`. |
| `git.baseBranch` | string | `"main"` | Branch new Workspaces fork from. |
| `git.mergeAction` | enum | `"pr"` | `pr` / `local`. |

A complete file with the defaults filled in:

```json
{
  "appearance": { "theme": "mozart", "colorMode": "system" },
  "notifications": { "desktop": true, "sound": true },
  "timeline": { "density": "normal" },
  "agent": { "model": null, "mode": "agent", "effort": "medium" },
  "git": { "baseBranch": "main", "mergeAction": "pr" }
}
```

## Overridable per project

Every key above is a personal default — any repo can pin its own value in
[Project settings](/docs/reference/project-settings), and that wins for that repo. Your global file
is what applies everywhere else.
