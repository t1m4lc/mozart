# AGENTS.md

> **Agent policy:** Do not create branches or commits without explicit approval. Do not run tests, linters, builds, or end-to-end checks unless explicitly requested; instead, provide a concise validation checklist with recommended commands and manual functional checks.

Operational map for AI agents.  
Read this first. Use `CLAUDE.md` for coding rules and constraints.

## Source of truth

- Coding rules: `CLAUDE.md`
- Main plan: `docs/specs/plan-v0.1.0-beta.1.md`
- Ignore: `docs/archive/**`

## Agent workflow

- Read `CLAUDE.md` before editing code.
- Verify latest code before changing anything.
- Define done before coding.
- Keep diffs minimal.
- Stage only intended files.
- Do not commit unless explicitly asked.
