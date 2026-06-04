# Mozart docs

Start here when you need product context, implementation specs, release
instructions, or test scenarios for Mozart.

## Where to start

- Product direction: `product/vision/operating-system-vision.md`
- Current MVP plan: `specs/plan-v0.1.0-beta.1.md`
- Engineering architecture: `engineering/architecture/mozart-architecture.md`
- Context compiler design: `engineering/architecture/context-compiler.md`
- Functional test scenarios: `engineering/testing/scenarios/README.md`
- Release process: `engineering/release/release-runbook.md`

## Current sections

- `product/` — product-facing material: vision, settings reference, go-to-market notes, and competitor research.
- `engineering/` — internal contributor material: architecture, specs, planning, testing, release, setup, and implementation prompts.
- `specs/` — compatibility location for the canonical v0.1.0-beta.1 plan named by repo-level agent instructions.
- `assets/` — brand assets and temporary preview snippets.
- `archive/` — historical, superseded, or temporary docs. These are preserved for context only and are not source of truth.

## Current vs archived

Use `product/`, `engineering/`, and `specs/plan-v0.1.0-beta.1.md` for current
planning and implementation. Use `archive/` only to understand prior decisions,
completed phases, old prompts, temporary audits, or superseded plans.

## Maintenance rules

- Keep product-facing docs under `product/`.
- Keep internal implementation docs under `engineering/`.
- Move stale docs to `archive/` instead of deleting them.
- Add a short note to `archive/README.md` when archiving a new group of docs.
