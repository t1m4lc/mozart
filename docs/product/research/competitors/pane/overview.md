# Pane — Competitor Overview

- **Website:** https://runpane.com
- **GitHub:** https://github.com/dcouple/Pane
- **Company:** Dcouple Inc
- **License:** AGPL-3.0 (fully open source)
- **Stack:** TypeScript + Electron (desktop app)
- **GitHub stars:** ~77 (early, active)
- **Platforms:** Windows, Mac, Linux (true cross-platform)

## Tagline

> "Run any agent. Any OS. Ship faster."
> "just terminals. no abstractions."

## What It Is

Pane is a keyboard-first desktop app for running multiple AI coding agents (Claude Code, Codex, Aider, Goose, or any CLI tool) in parallel. Each "pane" gets its own git worktree and as many terminal tabs as needed. Think Superhuman for AI agents — they bring zero opinions on which agent you use.

## Key Features

- **Parallel panes** — each with its own worktree, terminals, and isolated port range
- **Agent-agnostic** — any CLI agent (Claude Code, Codex, Aider, Goose, etc.)
- **Cross-terminal @mention** — type `@` to pull last 500 lines from another pane into context, no copy-paste
- **Built-in diff viewer** — syntax-highlighted diffs with keyboard shortcuts
- **Full git workflow** — commit, push, rebase, squash, merge, all from keyboard
- **Auto secrets copy** — `.env` mirrored automatically to each worktree
- **Port isolation** — each pane auto-assigned a port range, no conflicts
- **Built-in browser** — preview dev server URLs in a tab without alt-tabbing
- **Resource manager** — CPU/memory per pane and per process
- **Status dots** — idle/working/waiting indicators at tab, pane, and project level
- **Session persistence** — close laptop, reopen, agents still running
- **Claude Code scroll-jump bug fix** — patches upstream terminal rendering bug
- **Command palette (⌘K)** — every action keyboardable
- **Clipboard shortcuts** — `Ctrl+Alt+[key]` pastes saved prompt snippets instantly
- **Drag & drop** — drop files up to 50MB into terminal

## Positioning vs Conductor

From their own comparison table:

| | Pane | Conductor |
|---|---|---|
| Platform | Win + Mac + Linux | Mac (Apple Silicon only) |
| Agents | Any CLI | Claude + Codex |
| Open source | Yes (AGPL-3.0) | No |
| Git workflow | Full keyboard (commit, push, rebase, squash, merge) | Worktrees + PR |
| Keyboard-first | Every action | Partial |
| Cross-terminal context | @ to share output between terminals | No |
| Secrets sync | .env auto-copied to worktrees | Manual |
| Port isolation | Auto-assigned per pane | Manual |
| Session persistence | Yes | Yes |

They explicitly call out Conductor by name as a tool that "kept shoving features we didn't ask for and adding useless abstractions."

## Target Users

- Windows and Linux developers underserved by Mac-only tools
- Multi-agent power users who want one app to manage everything
- Keyboard-driven developers (Superhuman-like speed)
- Anyone juggling too many terminal windows

## Open Source Angle

AGPL-3.0 — modifications must be open-sourced, even when deployed as a service. Community can audit, build from source, and contribute. This is a strong trust signal and community magnet vs Conductor (closed source).

## Threats to conductor-copycat

1. **Cross-platform** — Pane wins on Linux/Windows where Conductor doesn't run at all
2. **Open source** — community building, trust, and free distribution
3. **Agent-agnostic** — not locked to Claude; broader appeal
4. **Keyboard-first** — fills the exact gap Conductor users complain about (too click-heavy)
5. **@mention context sharing** — unique UX nobody else has
6. **Auto secrets + port isolation** — removes real friction that competitors ignore
7. **Pricing** — currently free (open source), no subscription

## Opportunities / Differentiators to Build Against

- Pane is terminal-first, no AI chat UI layer → conductor-copycat could add richer structured task views
- No cloud/remote execution → conductor-copycat could offer cloud sandboxing
- AGPL license may limit commercial embedding → conductor-copycat could be MIT/Apache if targeting enterprise
- No built-in model switching UI → could add model provider management
