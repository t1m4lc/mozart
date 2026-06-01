---
description: How Mozart layers defaults, your machine, and per-project settings.
order: 3
---

Mozart resolves settings from three layers, each overriding the one below it. A layer only needs to
carry the keys it changes — everything else falls through.

```
bundled defaults  ◀  global settings  ◀  project settings
   (in the app)       (your machine)      (.mozart/settings.json)
```

- **Bundled defaults** ship inside the app. You never edit these.
- **[Global settings](/docs/concepts/global-settings)** — a `settings.json` on your machine. Your
  personal preferences, applied to every Project.
- **[Project settings](/docs/concepts/project-settings)** — an optional `.mozart/settings.json`
  committed in a repo. Shared by everyone who opens it, and able to override any global key.

The rule of thumb: **global is _you_** — your taste, on this machine. **Project is _the repo_** —
committed, shared by the team, and it wins.

## Editable vs internal

Only the `settings.json` files — global and per-project — are meant to be edited by hand.
Everything else Mozart keeps on disk (its database, your Projects and Workspaces, caches, logs) is
internal: hand-editing it can corrupt Mozart, so leave it alone. A malformed `settings.json` is
never fatal — Mozart ignores the bad layer and falls back to the one below.

## Next

See [Global settings](/docs/concepts/global-settings) for your machine-wide preferences, then
[Project settings](/docs/concepts/project-settings) for what travels with a repo.
