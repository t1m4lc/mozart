---
version: '0.1.0-beta.0'
date: 2026-05-27
title: First private beta
---

`v0.1.0-beta.0` is the first release of Mozart, shipped manually to invited beta testers via Google Drive — no public download, no auto-updater yet. The first public release is reserved for `v0.1.0`. Expect rough edges: this build exists so the developers who will actually use Mozart can shape it before we open the doors.

### Projects & Workspaces

- Open any local repo as a **Project**, or quick-start one (Mozart runs `git init`, and pushes to a private GitHub repo if connected).
- Every Project gets an auto-named first **Workspace** — an isolated, reviewable attempt at a Task.
- Package manager (npm / pnpm / yarn) is detected and dependencies are installed on first entry.

### Threads, Composer & Agent runs

- Three modes per message — **Agent**, **Plan**, **Ask** — switchable at any point.
- Up to four Threads per Workspace, each with its own mode, generated title, and unread counter.
- Model and effort selectors stay visible in the Composer (five effort levels: low / medium / high / xhigh / max).
- Claude streams straight into the **Timeline** with tool use, file edits, and shell output rendered live.

### Changes, Diff & Git

- Right aside file tree, live-watched on disk and `.gitignore`-aware, with `A` / `M` / `D` badges against the base branch.
- Click any changed file for a clean diff — Git internals stay out of the UI.
- Commit Changes from the aside header (per-file checkboxes, message field) and open draft or ready-for-review PRs directly from Mozart.

### Terminal, Run & IDE

- xterm.js **Terminal** scoped to each Workspace, persisted across navigation.
- Per-Project **Run** command with `idle` / `running` / `exited(code)` / `crashed` status and output streamed to a read-only panel.
- **Open in IDE** dropdown auto-detects VS Code, Cursor, Windsurf, the JetBrains family, Zed, and Sublime — the last-used one is remembered per user.

### Authentication

- Sign in via the `app.mozart.build` web app (Clerk + GitHub or Google), deep-linked back to the desktop via `mozart://auth`.
- Tokens live in the system keyring (Keychain / Credential Manager / secret-service) — never in plaintext, never in the local DB.
- Boots offline once you've signed in, as long as you have at least one local provider configured.

### Onboarding & UI

- Four-step first-run setup: Git detection, LLM provider, optional GitHub connection, optional product tour. Replay the tour any time from Settings.
- Two palettes — **mozart** (warm stone, default) and **zinc** (cool slate) — each with light, dark, and system-aware modes.
- Subtle violet brand accent (`#7C3AED`); `prefers-reduced-motion` honored across animations and transitions.

### Current limits

- Invite-only — no public download, distribution is manual via Google Drive.
- No auto-updater in beta.0 — the next build will require a manual re-download.
- `app.mozart.build` handles sign-in only; the cloud companion is not online yet.
- Claude is the only model provider wired in.
- Workspace aside width is fixed; no resizable layout, merge UI, conflict resolution, or in-app PR review.
- Skills (`/`) and context shortcuts (`@`) in the Composer are not in this build.
