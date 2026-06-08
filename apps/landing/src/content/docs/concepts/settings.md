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

## Global vs project

There are two settings you can edit, and the difference is simple:

- **Global settings** are **you** — your personal preferences, stored once on your machine and
  applied to every Project you open. Theme, notifications, your default Agent model.
- **Project settings** are **the repo** — committed in `.mozart/settings.json`, shared by everyone
  who opens it, and they win over your global preferences. Mostly: how to set up and run the
  project.

If a key is set in both, the project value wins. Anything a project doesn't set falls back to your
global preference, and anything you don't set falls back to the bundled default.

## Safe by design

Only the `settings.json` files — global and per-project — are meant to be edited by hand. Everything
else Mozart keeps on disk (its database, your Projects and Workspaces, caches, logs) is internal:
hand-editing it can corrupt Mozart, so leave it alone. A malformed `settings.json` is never fatal —
Mozart ignores the bad layer and falls back to the one below.

A full reference — the exact keys, defaults, and file locations — is coming soon.
