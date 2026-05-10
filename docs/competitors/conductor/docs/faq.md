---
title: FAQ
description: Frequently asked questions about Conductor
url: /docs/faq
site: www.conductor.build
---

# FAQ



## What are the city names? [#what-are-the-city-names]

Each workspace in Conductor is named after a city. We use cities as memorable, distinct names for different workspaces.

The city also serves as a stable name for the workspace directory, which lets your files live in a consistent place where coding agents and other programs can always find them.

In addition to the city, we also identify a workspace by its branch name or PR title. In the left sidebar, you'll see the PR title (if a PR is open) or the branch name.

Conductor always runs on your Mac, wherever you are. It doesn't actually run in the city, although that would be cool.

You can see all the cities you've visited in Conductor at cmd+K -> Passport.

## How does Conductor authenticate to Claude Code and Codex? [#how-does-conductor-authenticate-to-claude-code-and-codex]

By default, Conductor uses the auth tokens already saved on your machine. If you're logged into Claude Code with an API key, Conductor uses that; if you're logged in with Claude Pro or Max, Conductor uses that. You can also override this by setting an API key in Settings → Env.

## What permissions do agents have? [#what-permissions-do-agents-have]

Agents in Conductor run with the same permissions as your user account. They can read and write files, run shell commands, and access anything you can access on your machine.

Agents run directly on your system without sandboxing.

Most users don't experience any problems with this. If you want to be extra safe, you can run Conductor on a separate machine or VM dedicated to development work.

## Does Conductor add its own system prompts? [#does-conductor-add-its-own-system-prompts]

Yes. Conductor injects system prompts that explain to the agent that it's running inside Conductor, what a workspace is, and other context. It also injects prompts in response to various actions you take in the Conductor UI (e.g., creating a new workspace, or clicking "Create PR"); you can see and customize these prompts in Settings → \[your repository] → Preferences.

## Why does Conductor request access to Downloads, Reminders, etc.? [#why-does-conductor-request-access-to-downloads-reminders-etc]

When an agent or your shell tries to read a file in one of macOS's protected folders, the system displays a permissions pop-up. Conductor itself doesn't need access; it appears as "Conductor" because it's running the agent. Nothing unusual is happening on our end, and we're working to improve the user experience.

## How does Conductor make money? [#how-does-conductor-make-money]

Right now we don't. We're a small team running on seed funding from a few great investors who believe in our vision. At some point we plan to charge for collaboration features that help teams make the most of AI agents, but for now we're focused on making Conductor an amazing free tool.

## Which versions of Claude Code and Codex does Conductor use? [#which-versions-of-claude-code-and-codex-does-conductor-use]

Conductor comes bundled with its own installation of Claude Code and Codex, so that we can ensure compatibility. You can find them at `~/Library/Application Support/com.conductor.app/bin`. Do not update or modify them, or they might be incompatible with Conductor.

## Does Conductor support Claude Code agent teams? [#does-conductor-support-claude-code-agent-teams]

Yes! In Settings → Env, add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to enable Claude Code's experimental agent teams feature.

## Where does Conductor get the repo icon? [#where-does-conductor-get-the-repo-icon]

Conductor looks for an icon file in your repository root. It checks for common icon filenames in this order:

* `public/apple-touch-icon.png`
* `apple-touch-icon.png`
* `public/favicon.svg`
* `favicon.svg`
* `public/favicon.png`
* `public/icon.png`
* `public/logo.png`
* `favicon.png`
* `app/icon.png`
* `src/app/icon.png`
* `public/favicon.ico`
* `favicon.ico`
* `app/favicon.ico`
* `static/favicon.ico`
* `src-tauri/icons/icon.png`
* `assets/icon.png`
* `src/assets/icon.png`

The first match is used as the icon shown in the sidebar next to your repo name.

## I'm moving to a new computer, how can I transfer my chats? [#im-moving-to-a-new-computer-how-can-i-transfer-my-chats]

The easiest way is to use Apple's Migration Assistant to transfer all your files. This will let you pick up exactly where you left off.

If you're up for an adventure, you can also manually copy all files Conductor depends on. Conductor stores files at `~/Library/Application Support/com.conductor.app` and `~/conductor`. Claude Code and Codex store files in `~/.claude` and `~/.codex`. Make sure to copy while Conductor, Codex, and Claude Code are not running, and to use exactly the same destination paths.

 
