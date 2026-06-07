---
version: '0.1.0-beta.2'
date: 2026-06-07
title: Composer context — files, skills, and tokens
---

`v0.1.0-beta.2` turns the composer into a full context workspace. You can now attach files by typing `@`, invoke skills by typing `/`, and watch your token budget in real time — all without leaving the message input.

### New

- **Attach files with `@`.** Type `@` anywhere in the composer to open a file picker. It ranks open tabs first, then changed files, then the rest of your project by recent activity. Tick as many files as you need — they attach as pills in the composer and are sent as context with your message. Both `@` and `/` use fuzzy search, so you can find any file or skill without typing an exact prefix.

![@ file picker open in the composer showing a ranked list of files with checkboxes](/assets/changelog/v0-1-0-beta-2/at-file-picker.jpg)

- **Discover and run skills from `/`.** Type `/` to open a grouped skill menu backed by your filesystem. Mozart scans your provider directories (`~/.claude/skills`, `~/.codex/skills`) and your repo's `.mozart/skills` folder, so the list reflects the skills you actually have installed. Codex skills appear only when Codex is connected.

![Slash menu open in the composer showing grouped skills from the filesystem](/assets/changelog/v0-1-0-beta-2/slash-menu.jpg)

- **See your token budget at a glance.** A compact ring gauge in the composer footer shows how much context has been consumed. It stays neutral until you're in the amber zone, then turns red as you approach the limit. Each message turn also shows elapsed time and the exact input + output token count billed for that turn.

![Context gauge ring in the composer footer with per-turn token breakdown](/assets/changelog/v0-1-0-beta-2/context-gauge.jpg)

- **Fork a workspace from any branch.** Right-click a project and choose **Workspace from…** to pick the branch to fork from, instead of always starting from `main`. You can also set a `git.baseBranch` in your project's `.mozart/settings.json` so every new workspace starts from the right branch by default.

<div class="img-row">
  <img src="/assets/changelog/v0-1-0-beta-2/branch-picker-menu.jpg" alt="Context menu showing the Workspace from… action on a project" />
  <img src="/assets/changelog/v0-1-0-beta-2/branch-picker-dialog.jpg" alt="Branch picker dialog with a searchable combobox listing all available branches" />
</div>

### Improved

- **Onboarding detects your existing sessions more reliably.** Mozart now checks the macOS Keychain for a Claude Code session, so you're connected automatically if you've already logged in through the Claude Code CLI. The provider connect flow also shows a visible "checking…" state instead of going silent, and surfaces any login errors with a **Recheck** button so you can retry without restarting.

### Fixed

- **Codex works when installed via nvm.** Mozart now resolves the nvm-managed Node.js path automatically, so the Codex CLI is detected even when your shell's default `PATH` doesn't include the nvm shim directory.

- **`@` file selection survives alt-tab.** The file picker no longer closes when you switch to another app mid-selection. Your checked files stay selected until you come back and press Enter or Esc.
