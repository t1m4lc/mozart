# Plan: <title>

**Spec source:** <path to PLAN-v0.0.1.md section / mozart-implementation-flow.md milestone / .context/context.md>
**Author:** /plan
**Date:** YYYY-MM-DD
**Confidence:** N/10

---

## 1. Verified repo truths

> Present-tense facts only. Each line cites `file:line`. No proposal language. The `plan-reviewer` will check every claim.

- `apps/desktop/src/app/app.config.ts:12` registers `provideTheme()`
- `libs/ui/button/src/lib/button.ts:8` exports `HlmBtn` directive with `cva()` variants
- `nx.json:18` defines the `lint` and `test` targets
- (etc.)

## 2. Intent — what we're delivering

> 2–4 sentences. What changes for the user / system after this plan ships.

## 3. Non-goals

> Things explicitly excluded. Deferred items go here so the reviewer doesn't flag them as gaps.

- <thing> — deferred to <plan / milestone>

## 4. Architecture decisions locked in this plan

> Each is a decision, not a discussion.

- **<decision>** — rationale (1 sentence, link to `.context/context.md` if relevant)

## 5. Files

### To create
- `path/to/new/file.ext` — purpose

### To modify
- `path/to/existing.ts:42` — what changes and why

### Reference (read-only — model the new code on these)
- `libs/ui/button/src/lib/button.ts` — pattern to mirror for the `cva()` + `classes()` setup

## 6. Pseudocode (per non-trivial unit)

### `<file or function>`
```
function foo(input) {
  validate(input)
  query the workspace table
  if not found → AppError::WorkspaceMissing
  spawn the worktree creator with cwd = workspace.root
  return WorktreeId
}
```

## 7. Error handling strategy

- Rust errors → `AppError` enum, exported via `tauri-specta` (see `src-tauri/src/error.rs`)
- Angular: errors from IPC are typed; surface via toast for user-actionable, log for the rest
- SQLite: WAL mode means readers can race writers; use the writer-task pattern

## 8. Task list (will be atomized into TASKS.md)

> List in execution order. The `/atomize` skill will split each into atoms with allowed/forbidden files. Mark items that can run in parallel after their dependencies clear.

1. Schema/migration for `<table>`
2. Rust command: `<name>`  (depends: 1)
3. tauri-specta export + Angular service wrapper  (depends: 2)
4. Angular component: `<name>`  (depends: 3) [parallel with 5]
5. Angular component: `<name>`  (depends: 3) [parallel with 4]
6. End-to-end wiring smoke test  (depends: 4, 5)

## 9. Validation gate

```sh
pnpm nx run-many -t lint test --projects=desktop
cargo test -p desktop
# Plan-specific:
# <any extra command, e.g. a manual smoke step>
```

## 10. Rollback

> If this plan ships and breaks something downstream, how do we revert cleanly? (Often: just revert the commits. Note exceptions — schema migrations, generated bindings, etc.)

## 11. Open questions

> Should be empty before handing off. If anything is here, /plan is not done.

(none)

## 12. Confidence

**N/10** — <one sentence justifying the score>
