---
version: '0.1.0-beta.1'
date: 2026-06-04
title: Codex joins Mozart
---

`v0.1.0-beta.1` adds Codex as a first-class agent option, ships Mozart's first over-the-air update, and tightens the release experience around the desktop app and changelog.

### New

- **Run Claude Code or Codex from Mozart.** Connect either provider during onboarding or from Settings, then choose the agent that fits the task before you run a Workspace.

- **Use your existing Codex login.** If you already use `codex login`, Mozart can detect that session so you do not have to paste an API key again.

- **Choose Codex models from the composer.** OpenAI models now appear alongside the existing Claude choices, including GPT-5 and GPT-5 mini through Codex.

- **"Restart to install" update notification.** This is the first update delivered over the air — if you have beta.0 installed, Mozart downloads the patch silently in the background and shows a "Restart to install" button when it's ready. Click it whenever you're at a good stopping point; nothing interrupts until you do.

- **Changes tab is split into Uncommitted and Committed sections.** The file list in the Changes aside is now divided into two clear groups — files you haven't committed yet, and the commits already on your branch. It's easier to see what's pending and what's done at a glance.

- **Files edited outside Mozart stay in sync.** If you open a file in Mozart and then edit it in your IDE or terminal, Mozart now reconciles the open view against the change on disk. No more stale content after switching between tools.

### Improved

- **Release notes now have dedicated pages.** Changelog links open directly to the right version, including links from the desktop app after an update.

- **The landing page now reflects the agents users can actually run.** The homepage, FAQ, docs, and release index now describe Claude Code and Codex together instead of presenting Mozart as Claude-only.

### Fixes

- **Committing files no longer breaks the PR flow.** In beta.0, clicking "Commit & Open PR" with uncommitted changes would fail with an error. The root cause was a missing branch reference being passed to the dialog. This is now fixed — the commit goes through cleanly and the PR opens as expected.

- **New files show up in the Changes tab.** Beta.0 only listed files that git was already tracking. If Claude created a brand-new file, it was invisible in the Changes side panel and couldn't be committed from there. Now, new (untracked) files appear with an **A** badge alongside modified files — you can select and commit them normally.

- **Agent runs no longer create ghost commits.** Before every agent run, Mozart was silently creating a `checkpoint before run` commit in your repository to mark the starting state. These showed up in `git log` and were confusing and unexpected. Mozart now captures the same information without creating any commit — your history stays clean.

- **Changes tab and file-count chips refresh immediately after a commit.** After committing, the `+N / -N` counters in the sidebar and the file list in the Changes panel now update right away instead of showing stale data until the next refresh.

- **Package installation works reliably when Mozart is launched from the Dock or desktop.** When you open Mozart by clicking its icon (rather than from a terminal), it inherits a minimal system PATH that may not include tools installed via nvm or Volta. Mozart now augments its PATH at startup so package managers installed with those version managers are always found when auto-installing workspace dependencies.
