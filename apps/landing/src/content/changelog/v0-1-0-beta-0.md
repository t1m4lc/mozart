---
version: '0.1.0-beta.0'
date: 2026-06-01
title: First private beta
---

`v0.1.0-beta.0` is the first release of Mozart — and by far the biggest, since everything ships at once. It's downloaded straight from `mozart.build` behind a beta access code — no Google Drive, and the auto-updater is live from day one, so every release after this one installs itself. The first public release is reserved for `v0.1.0`. Expect rough edges: this build exists so the developers who will actually use Mozart can shape it before we open the doors.

### Projects & Workspaces

- Open any local repo as a **Project**, create one from a fresh folder (Mozart runs `git init`, registers it, and opens it), or **clone from GitHub** — paste a URL, or search your account's repos with private/public badges and a live filter when GitHub is connected.
- Every Project gets an auto-named first **Workspace** — an isolated, reviewable attempt at a Task.
- Package manager (npm / pnpm / yarn) is detected and dependencies are installed on first entry.

### Projects view — filter, group & state

- **Filter** the project list from the header multi-select — show everything, or just the projects you're focused on.
- **Group by** Project (default) or **Status** for a kanban-style view across workspace states.
- Each Workspace carries a state — **Backlog**, **In Progress**, **In Review**, **Done**, **Canceled** — set from the toolbar menu (with a confirm on transitions like reopening a Done workspace).
- States also **advance on their own**: the first commit moves a Backlog workspace to In Progress, and opening a PR moves it to In Review.

### Threads, Composer & Agent runs

- Three modes per message — **Agent**, **Plan**, **Ask** — switchable at any point.
- Up to four Threads per Workspace, each with its own mode, generated title, and unread counter.
- Model and effort selectors stay visible in the Composer (five effort levels: low / medium / high / xhigh / max).
- Claude streams straight into the **Timeline** with tool use, file edits, and shell output rendered live.

### Changes, Diff & Git

- Right aside file tree, live-watched on disk and `.gitignore`-aware, with `A` / `M` / `D` badges against the base branch.
- Click any changed file for a clean diff — Git internals stay out of the UI.
- **Edit files in place** — a real editor with an Edit/Diff toggle, save or discard, and an unsaved-changes badge.
- Commit Changes from the aside header (per-file checkboxes, message field) and open draft or ready-for-review PRs directly from Mozart.

### Terminal, Run & IDE

- xterm.js **Terminal** scoped to each Workspace, persisted across navigation.
- Per-Project **Run** command with `idle` / `running` / `exited(code)` / `crashed` status and output streamed to a read-only panel.
- **Open in IDE** auto-detects VS Code, Cursor, Windsurf, Zed, Sublime Text, IntelliJ IDEA, WebStorm, and PyCharm — plus File Manager and Terminal, always available. The last-used one is remembered.

### Authentication

- Sign in via the `app.mozart.build` web app (Clerk + GitHub or Google), deep-linked back to the desktop via `mozart://auth`. This web sign-in is the foundation the future cloud Mozart will build on.
- Tokens live in the system keyring (Keychain / Credential Manager / secret-service) — never in plaintext, never in the local DB.
- Boots offline once you've signed in, as long as you have at least one local provider configured.

### Settings

- A layered `settings.json` resolves **bundled defaults ◀ global ◀ per-project** (`<repo>/.mozart/settings.json`), deep-merged — a missing or malformed layer is skipped, never fatal.
- Covers theme and color mode, notifications, new-chat agent defaults, and per-project Run/Setup scripts.
- Edit it from the in-app **Settings** page or directly on disk.

### Onboarding & UI

- Four-step first-run setup: Git detection, LLM provider, optional GitHub connection, optional product tour. Replay the tour any time from Settings.
- The **mozart** theme (warm stone) with light, dark, and system-aware modes.
- Subtle violet brand accent (`#7C3AED`); `prefers-reduced-motion` honored across animations and transitions.

### Current limits

- Invite-only — the download from `mozart.build` is gated by a beta access code.
- `app.mozart.build` handles sign-in only; the cloud companion is not online yet.
- Claude is the only model provider wired in.
- Workspace aside width is fixed; no resizable layout, merge UI, conflict resolution, or in-app PR review.
- Skills (`/`) and context shortcuts (`@`) in the Composer are not in this build.
</content>
