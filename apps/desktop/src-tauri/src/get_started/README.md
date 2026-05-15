# Get started with Mozart

Welcome — you're in the bundled **Get started** project. It's here so
you can poke around Mozart's loop (ask, agent edits, review, ship)
without leaving the app.

> **Want the guided tour first?** Open **Settings → Replay tour** to
> walk through Mozart's interface with on-screen highlights. We
> intentionally don't auto-start it — most people prefer to look
> around first.

## Try one of these prompts

Type into the composer below. Mozart spins up a fresh agent run
inside this workspace ; the diff lands in the right-hand **Files**
tab as it happens.

1. `Add a function 'greet(name)' to hello.js that returns "Hello, {name}!"`
2. `Wrap the greet() call in a loop that greets three names from an array, and print the results`
3. `Add a small test file 'hello.test.js' with one assertion against greet()`

When the agent stops :

- Open the **Files** tab on the right to read the diff.
- Use **Open in IDE** for bigger edits — Mozart will pick the change
  up on save.
- **Commit** lands the change on this workspace's branch.
- **Pull Request** ships it (you'll need GitHub connected — see
  **Settings → Connections**).

## What you have

- `hello.js` — a single-file starter you can mutate freely.
- A git repository with a `main` branch. Mozart spins workspaces off
  that base, one per task.

When you're done : right-click the **Get started** entry in the left
sidebar to delete it. There's no hidden state to clean up.

## Stuck?

- **Tour again** — Settings → Replay tour.
- **Sign in trouble** — re-open the desktop, click **Sign in** on the
  welcome screen, and follow the browser handoff.
- **Provider issues** — Settings → LLM providers shows the
  connection state with a Reconfigure button.
