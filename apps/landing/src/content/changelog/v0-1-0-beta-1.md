---
version: '0.1.0-beta.1'
date: 2026-05-29
title: Settings & cleaner local storage
---

> **Draft** — adjust the version and date when this ships. Captures the settings + local-persistence work landing after `v0.1.0-beta.0`.

This build makes everything Mozart stores on your machine clean, predictable, and — where it should be — yours to edit.

### Settings you can actually edit

- Mozart now reads settings from three layers: **bundled defaults ◀ your machine ◀ this project**. Each layer overrides the one below and only carries the keys it changes.
- Your personal preferences live in a human-readable **`settings.json`** (theme, color mode, desktop notifications, sound, default Agent model / mode / effort).
- A repo can commit its own **`.mozart/settings.json`** to adapt Mozart for everyone who opens it — and override any global key.
- A bad edit can't brick the app: a missing or malformed layer is ignored and Mozart falls back to the layer below.

### Tidier local storage

- Everything Mozart writes now lives in the standard per-OS locations under one app id — Application Support / `~/.local/share` / `%APPDATA%` for data, the matching config and cache dirs alongside. No more files scattered across your home folder.
- A clear line between **editable** files (the `settings.json` pair) and **internal** ones (database, Projects, Workspaces, cache, logs) that you should leave to Mozart.

### Project run/setup commands move to settings

- A project's **run** and **setup** commands now live in `.mozart/settings.json` under `scripts`, replacing the old `.mozart/run.json`. One shared definition, committed with the repo; auto-detection still fills in defaults when a project has none.

### Notes

- This is a clean break: `.mozart/run.json` is no longer read. Move any committed run/setup commands into `.mozart/settings.json` under `scripts`.
