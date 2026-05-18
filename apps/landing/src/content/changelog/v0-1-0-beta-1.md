---
version: '0.1.0-beta.1'
date: 2026-05-16
title: First private beta
---

This is the first non-public beta of Mozart (`v0.1.0-beta.1`). The first public release is reserved for `v0.1.0`. Expect rough edges — we're shipping early so the developers who will actually use Mozart can help shape it.

### Projects

- Open any local repository as a Mozart **Project**.
- Quick-start a new Project: Mozart creates the folder, runs `git init`, and (if GitHub is connected) creates a private repo and pushes the first commit.
- Sidebar lists every Project with its Workspaces nested underneath.

### Workspaces

- Every Project gets an auto-named first **Workspace** on open (`bob-marley-1`, `radiohead-2`, …).
- A Workspace is an isolated, reviewable attempt at a Task — Changes stay scoped until you ship them.
- Mozart detects your package manager (npm / pnpm / yarn) and installs dependencies the first time you enter the Workspace.

### Threads + Composer

- Send messages in three modes: **Agent**, **Plan**, **Ask**. Mode is switchable between every message, not locked at first send.
- Up to four Threads per Workspace, each with its own mode, generated title, and unread counter.
- Composer keeps the model and effort selectors visible at all times. Five effort levels: low / medium / high / xhigh / max.

### Agent Runs

- Claude streams responses straight into the **Timeline**, rendering tool use, file edits, and shell output as they happen.
- File edits land in your repository immediately — open it in your IDE on the Workspace branch and watch them appear live.
- Streams survive tab switches; the Composer sticks an indicator on the tab while a Run is in flight.

### Changes + Diff

- Right aside file tree with `A` / `M` / `D` badges against the base branch, watched live on disk (`.gitignore`-aware, toggleable).
- Click any changed file to open a clean diff. Base branch and current state are surfaced; Git internals stay out of the UI.

### Terminal + Run + IDE

- xterm.js Terminal scoped to each Workspace, persisted across navigation.
- Per-Project **Run** command with `idle` / `running` / `exited(code)` / `crashed` status and output streamed to a read-only xterm panel.
- **Open in IDE** dropdown auto-detects VS Code, Cursor, Windsurf, the JetBrains family, Zed, and Sublime — the last-used one is remembered per user.

### Commit + Create PR

- Commit Changes from the aside header: per-file checkboxes (all checked by default) and a message field.
- Create draft or ready-for-review pull requests directly from Mozart when GitHub is connected, with title and body prefilled from the most recent commit.

### Authentication

- Sign in via the `app.mozart.build` web app (Clerk + GitHub or Google), deep-linked back to the desktop via `mozart://auth`.
- Tokens live in the system keyring (Keychain / Credential Manager / secret-service) — never in plaintext, never in the local DB.
- Boots offline once you've signed in, as long as you have at least one local provider configured.

### Onboarding

- Four-step first-run setup: Git detection, LLM provider, optional GitHub connection, optional product tour.
- Git is detected via `git --version`; if missing, Mozart shows OS-specific install instructions with copy-paste commands.
- Replay the tour any time from Settings.

### Theme + UI

- Two palettes — **mozart** (warm stone, default) and **zinc** (cool slate) — each with light, dark, and system-aware modes.
- Subtle violet brand accent (`#7C3AED`) shared across both themes; borders, cards, and inputs stay neutral in dark mode.
- `prefers-reduced-motion` honored across animations and transitions.

### Known limitations

- No public download yet; access is invite-only during the preview.
- `app.mozart.build` handles sign-in only; the cloud companion is not online yet.
- Claude is the only model provider wired in. OpenAI, OpenRouter, and local models are coming.
- Workspace aside width is fixed; resizable layout, merge UI, conflict resolution, and in-app PR review are deferred.
- Skills (`/`) and context shortcuts (`@`) in the Composer are post-MVP.
