---
name: commit
description: Draft a Conventional Commits message for the current changes
model: cheapest
---

Write a single Conventional Commits message for the staged changes (fall back to
the working tree if nothing is staged).

1. Read the diff: `git diff --staged` (or `git diff` if the index is empty).
2. Infer the `type` from the change: `feat`, `fix`, `refactor`, `perf`, `docs`,
   `test`, `chore`, `build`, or `ci`.
3. Infer a short, lower-case `scope` from the touched area (the Nx project or
   domain, e.g. `skills`, `composer`). Omit it if the change spans many areas.
4. Format: `<type>(<scope>): <description>` — imperative mood, no trailing
   period, subject under ~72 chars. Add a body only when the "why" is not
   obvious from the subject.

Output the message only. Do not run `git commit` — staging and committing are
the user's call (this repo requires explicit approval before any commit).
