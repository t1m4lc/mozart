---
description: Per-repo settings committed in .mozart/settings.json, shared by the team.
order: 2
---

Project settings live in `.mozart/settings.json` inside a repo. Unlike
[Global settings](/docs/reference/global-settings), they're **committed with the code**, so everyone
who opens the repo gets the same setup. Use them for anything that's about _the project_ rather than
_you_ — most importantly, how to install and run it.

## How they differ from global

| | Global settings | Project settings |
|---|---|---|
| Lives in | `settings.json` on your machine | `.mozart/settings.json` in the repo |
| Scope | Every Project you open | Just this repo |
| Shared | No — personal to you | Yes — committed for the team |
| Wins? | Loses to project | **Overrides global** |

## Project wins

When the same key is set in both layers, the project value wins. Example: your global default is
the `mozart` theme, but a repo pins `dracula` —

```json
{
  "appearance": { "theme": "dracula" }
}
```

— and everyone sees that repo in `dracula`, no matter their personal theme. The same goes for any
key in the [global reference](/docs/reference/global-settings): pin `git.baseBranch`,
force an `agent.model`, and so on.

## The setting that's truly project-specific: `scripts`

`scripts` defines how to set up and run the project. It only makes sense per repo, so it lives here
and the whole team shares one definition:

```json
{
  "scripts": {
    "setup": "npm install",
    "run": "npm run dev"
  }
}
```

- **`setup`** runs once to install dependencies; **`run`** starts the dev process.
- You can add more named scripts (e.g. `"test"`, `"lint"`).
- Order is load-bearing — it drives the tab order in the Run panel (left tab = first key).
- When a repo has no committed `scripts`, Mozart detects your package manager and fills in sensible
  defaults on first entry.
