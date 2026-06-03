# Changelog

All notable changes to Mozart are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Marketing-facing release notes live under
`apps/landing/src/content/changelog/` and render on
`https://mozart.build/changelog/v-<slug>`. This file is for developers
and the GitHub Release body.

## [Unreleased]

## [0.1.0-beta.0.1] — 2026-06-03

Hotfix patch on top of beta.0. Auto-updater delivers this to all installed
beta.0 copies. See
[mozart.build/changelog/v-0-1-0-beta-0-1](https://mozart.build/changelog/v-0-1-0-beta-0-1)
for the full narrative.

### Fixed

- `commit.rs`: checkpoint no longer creates a spurious "checkpoint before run"
  commit — it now records HEAD sha in-memory only. Eliminates unwanted entries
  in user git history.
- `commit.rs`: `list_branch_diff_files` now includes untracked (new) files via
  `git ls-files --others`; Changes tab correctly shows them with `A` badge.
- `commands/mod.rs`: workspace package-manager install now runs with
  augmented PATH so nvm / volta shims are found when app is launched from
  GUI without a full login-shell PATH.
- `feature-create-pr-dialog.ts` / `shell-right.ts`: PR dialog receives branch
  name and seeds a correct default commit message; resolves crash on commit
  when `branch` was `undefined`.
- `workspace.facade.ts`: after a successful commit, both the Changes-tab cache
  and the sidebar `+N/-N` chips refresh immediately.

## [0.1.0-beta.0] — 2026-05-27

First private beta.
See [mozart.build/changelog/v-0-1-0-beta-0](https://mozart.build/changelog/v-0-1-0-beta-0)
for the full narrative; this section captures the dev-facing summary.

### Added

- Projects, Workspaces, Threads (Agent / Plan / Ask modes), Agent Runs
  streaming into Timeline, Changes + Diff aside, xterm Terminal, per-project
  Run command, Open in IDE menu, Commit + Create PR flows, Clerk-backed
  sign-in via `app.mozart.build`, system keyring token storage, four-step
  onboarding, mozart + zinc themes with light / dark / system modes
- Apps `landing` (mozart.build) and `web` (app.mozart.build) migrated to
  `@nx/vite:build` + `@analogjs/vite-plugin-angular` with shared
  `environment.ts` / `environment.prod.ts` pattern
- Cloudflare Pages Functions for `/api/analytics/*` and `/api/github/*`

### Known limitations

- No public download; access is invite-only
- Cloud companion (app.mozart.build) handles sign-in only — no synced state yet
- Only Claude is wired in as a model provider
