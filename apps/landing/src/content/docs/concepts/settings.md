---
description: How Mozart layers defaults, your machine, and per-project settings.
order: 3
---

Mozart resolves settings from three layers, each overriding the one below it. A layer only needs to carry the keys it changes — everything else falls through.

```
bundled defaults  ◀  your machine  ◀  this project
   (in the app)       (settings.json)   (.mozart/settings.json)
```

- **Bundled defaults** ship inside the app. You never edit these.
- **Your machine** — a global `settings.json` with your personal preferences (theme, notifications, default Agent model and effort).
- **This project** — an optional `.mozart/settings.json` committed in a repo. It adapts Mozart to that project and can override any global key, so everyone who opens the repo gets the same setup.

## Where your settings live

The global `settings.json` follows your operating system's conventions:

| OS | Global `settings.json` |
|----|------------------------|
| macOS | `~/Library/Application Support/build.mozart.desktop/settings.json` |
| Linux | `~/.config/build.mozart.desktop/settings.json` |
| Windows | `%APPDATA%\build.mozart.desktop\settings.json` |

Project settings live with the repo, at `.mozart/settings.json`.

## Editable vs internal

Only the `settings.json` files — global and per-project — are meant to be edited by hand. Everything else Mozart keeps on disk (its database, your Projects and Workspaces, caches, logs) is internal: hand-editing it can corrupt Mozart, so leave it alone. A malformed `settings.json` is never fatal — Mozart ignores the bad layer and falls back to the one below.

## Project run & setup commands

A repo's run and setup commands live in its `.mozart/settings.json` under `scripts` — so the whole team shares one definition:

```json
{
  "scripts": {
    "setup": "npm install",
    "run": "npm run dev"
  }
}
```

When a project has no committed `scripts`, Mozart detects your package manager and fills in sensible defaults on first entry.

## Next

For the complete list of keys and their defaults, see the [local-first](/docs/concepts/local-first) overview of what stays on your machine.
