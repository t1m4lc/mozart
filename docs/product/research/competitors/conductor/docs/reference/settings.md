---
title: Settings
description: Reference for Conductor account, model, provider, repository, and app settings
url: /docs/reference/settings
site: www.conductor.build
---

# Settings



Settings control how Conductor runs agents, repositories, scripts, and app behavior on your Mac.

## Managed settings [#managed-settings]

Managed settings are provisional. Organizations can manage selected settings by writing `~/.conductor/settings.json` on a user's Mac.

Managed values override local database settings, disable the matching controls in Settings, and are used when Conductor launches agents.

Use the published schema for editor autocomplete and validation. You can also point an agent to `https://conductor.build/schemas/settings.json` so it can fetch the supported managed settings:

```json
{
    "$schema": "https://conductor.build/schemas/settings.json",
    "enterpriseDataPrivacy": true,
    "claudeExecutablePath": "/opt/homebrew/bin/claude",
    "defaultModel": "gpt-5.5"
}
```

Supported managed settings:

| Setting | Type | Description |
| --- | --- | --- |
| `enterpriseDataPrivacy` | boolean | Enables Enterprise data privacy. |
| `claudeExecutablePath` | string | Overrides the Claude Code executable path. |
| `defaultModel` | string | Sets the default model. Supported values are defined by the JSON Schema. |

## Account [#account]

Use Account settings for sign-in, privacy controls, and account-level preferences. Privacy-sensitive behavior is also covered in [Privacy](/docs/reference/privacy).

## Models [#models]

Use Models settings to choose which Claude Code and Codex models appear in the model picker. Some model-specific controls, such as thinking or reasoning level, are configured per session.

## Providers [#providers]

Use Providers settings to configure model providers such as Anthropic-compatible providers, Bedrock, Vertex, OpenRouter, or Vercel AI Gateway.

For setup examples, see [Configure model providers](/docs/guides/providers).

## Repositories [#repositories]

Repository Settings control behavior for one repository:

* Workspace path
* Files to copy into new workspaces
* Git remote behavior
* Setup, run, and archive scripts
* Shared `conductor.json` configuration
* Code review preferences
* Create PR preferences
* Fix errors preferences
* Resolve conflicts preferences
* Branch rename preferences
* General preferences

Use repository preferences for instructions that should apply every time an agent works in that repository.

For file-copy pattern behavior, see [Files to copy](/docs/reference/files-to-copy).

## Git [#git]

Git settings control how Conductor interacts with local branches, remotes, pull requests, and related GitHub flows.

## Appearance and storage [#appearance-and-storage]

Appearance settings control UI preferences. Storage settings help you inspect or manage local Conductor data.

## Experimental [#experimental]

Experimental settings expose features that are still changing. Documentation for experimental behavior may be narrower than documentation for stable features.

Big Terminal Mode is enabled from Experimental settings. For behavior and shortcuts, see [Big Terminal Mode](/docs/reference/big-terminal-mode).

 
