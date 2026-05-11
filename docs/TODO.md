# TODO — Mozart v0.0.1

**Status board.** Single source of truth for what is shipped, what is next, and what is parked.
**Date:** 2026-05-10
**Continuation plan:** [`specs/plan-v0.0.1-2.md`](./specs/plan-v0.0.1-2.md) (read this before resuming)
**Concept model:** [`specs/mozart-worktree-swarm-design-synthese.md`](./specs/mozart-worktree-swarm-design-synthese.md) (vision) + canonical model in CLAUDE.md
**Spec:** [`PLAN-v0.0.1.md`](./PLAN-v0.0.1.md) — milestone numbering uses **Step 1.x**, not M1–M13. The M-numbering is retired (D22).

> **Golden rule:** the user never sees `worktree`, `branch_name`, `worktree_path`, `agent/wip-…`, `detached HEAD`, or any other git plumbing in UI strings. They see **Workspace**, **Task**, **Run**, **Diff**, **Candidate**, **Merge Decision**.

---

## 1. Already shipped (Lane A, Phase 1)

### [x] Step 1.1 — Repo bootstrap

- Nx + pnpm workspaces, Angular `apps/desktop` + `apps/web`, vendored Spartan UI lib (`libs/ui/*`), Tauri v2 scaffolded.
- Commands gate: `pnpm nx run-many -t typecheck/lint/test` works at root.

### [x] Step 1.2 — Spikes A–E + Cargo bootstrap + root scripts

Closed in [`tmp/done-plans/02-step-1-2-spikes.md`](../tmp/done-plans/02-step-1-2-spikes.md). Five `#[ignore]`-gated POCs proved:

- **Spike A** — `git worktree add` cross-platform from `Command::new("git")`.
- **Spike B** — `tauri-plugin-sql` + WAL + 3-table stripped schema, busy_timeout 5000.
- **Spike C** — `claude -p ... --output-format=stream-json` first event < 5 s, JSON-parsable lines.
- **Spike D** — `tauri-specta` exports a typed `commands` + `events` surface to `apps/desktop/src/app/_bindings.ts`.
- **Spike E** — `portable-pty` spawns `claude --version` and captures output.

Cargo deps committed: `tauri-plugin-sql`, `tauri-specta` v2, `portable-pty`, `tokio`, `uuid v4`, `keyring` v3, `tempfile` (dev), `anyhow` (dev). `package.json` exposes `typecheck/lint/test/build`.

### [x] Step 1.3 — DB layer

Closed in [`tmp/done-plans/03-step-1-3-db.md`](../tmp/done-plans/03-step-1-3-db.md). Atoms S1.3.1–S1.3.8 shipped in 5 commits.

- `apps/desktop/src-tauri/migrations/001_init.sql` — 9 tables + `schema_version` + 6 indexes (D16 verbatim).
- `apps/desktop/src-tauri/src/error.rs` — `AppError` enum (`Db | Io | NotFound | Validation`) with `serde + specta::Type`.
- `apps/desktop/src-tauri/src/db/mod.rs` — `DbState`, pragma chain (WAL / synchronous=NORMAL / busy_timeout=5000 / foreign_keys=ON), embedded migration runner, `new_id()` UUIDv4 helper, `now_ms()` clock.
- `apps/desktop/src-tauri/src/db/models.rs` — 9 row structs (Repo, Task, Workspace, Thread, AgentRun, AgentEvent, WorkspaceChange, OutboxEvent, ConfigEntry).
- 8 CRUD modules with full round-trip + status-lifecycle tests: `repos`, `tasks`, `config`, `threads`, `workspaces`, `agent_runs`, `agent_events`, `workspace_changes`, `outbox`.
- ~34 in-memory tests passing under `cargo test --tests db::*`.
- `S1.3.9` final gate (`cargo check && cargo test --tests && cargo clippy -- -D warnings && pnpm lint`) ticks closed at the start of Step 1.4 (run once).

---

## 2. Needs verification before resuming (~5 min)

Run these before touching any new code in Lane A:

```sh
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && cargo test --tests
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings
pnpm nx lint desktop
pnpm nx run-many -t typecheck

# Naming Lock guard — must produce zero hits outside docs/competitors/conductor/
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts" 2>/dev/null
```

If any gate fails: stop, do not start Step 1.4, return to `/plan-eng-review` with the failing line.

Documentation alignment to confirm (one-shot, not recurring):

- [x] `CLAUDE.md` § "Product vocabulary" exists and matches the canonical 8-term model in `specs/plan-v0.0.1-2.md` § 3. (Addressed by **doc atom F0** — applied 2026-05-11, commit 41a951f.)
- [x] `AGENTS.md` no longer references `docs/mozart-implementation-flow.md` as live; pointer fixed to `docs/specs/plan-v0.0.1-2.md` + `docs/TODO.md`. (Addressed by F0 — applied 2026-05-11, commit 41a951f.)
- [ ] `docs/test-plan-v0.0.1.md` carries a "superseded by ./timothy-main-eng-review-test-plan-20260509-072442.md" header (D23) — applied this pass; verify by reading the first 5 lines of `docs/test-plan-v0.0.1.md`.

---

## 3. Next implementation tasks (Lane A 1.4 → 1.9)

For each step the **atomic** breakdown lives in `specs/plan-v0.0.1-2.md` § 6. Source-of-truth precedence: continuation plan > PLAN-v0.0.1.md > this TODO.

### [x] Step 1.4 — `claude_cli.rs` (2026-05-10)

- [x] **S1.4.1** — `StreamEvent` enum + `parse_line` (parser shape, lossless fallback) (2026-05-10)
- [x] **S1.4.2** — `claude_cli::version_check` + `detect_installed` (2026-05-10)
- [x] **S1.4.3** — `claude_cli::spawn_run` (subprocess + stream + persist; checkpoint/diff deferred to Step 1.5 reach-back per plan §11 Q-A) (2026-05-10)
- [x] **S1.4.4** — Step 1.4 final gate (cargo check + cargo test + clippy) (2026-05-10)

### [x] Step 1.5 — `sandbox.rs` (2026-05-10)

- [x] **S1.5.1** — `git_checkpoint(workspace_path) -> sha` (D13) (2026-05-10)
- [x] **S1.5.2** — `capture_diff(workspace_path, base_sha) -> DiffSummary` (2026-05-10)
- [x] **S1.5.3** — `discard_changes_to(workspace_path, sha)` with path-under-canonical-root guard (2026-05-10)

### [x] Step 1.6 — `worktree.rs` + `branch_name.rs` + `git_query.rs` (2026-05-10)

- [x] **S1.6.1** — `branch_name.rs` slug + `git check-ref-format` gate (2026-05-10)
- [x] **S1.6.2** — `git_query.rs` `validate_repo` (typed `RepoIssue` enum) + `list_branches` + `check_git_available` (2026-05-10)
- [x] **S1.6.3** — `worktree.rs` create / remove / `cleanup_orphans` with **D18 path lock: `~/.mozart/worktrees/{workspace_id}/`** (2026-05-10)
- [x] **S1.6.4** — `workspace_service::create_workspace` orchestrator (validate → Task → Workspace → worktree → Thread, with rollback) (2026-05-10)

### [x] Step 1.7 — Tauri commands wiring + tauri-specta TS bindings (2026-05-11)

- [x] **S1.7.1** — `commands/mod.rs` skeleton with 12 stubs + `#[specta::specta]` annotations + `tauri_specta::collect_commands!` registration (atomized to S1.7.1a + S1.7.1b — 2026-05-11, commits 4a8cfdb, 7856916)
- [x] **S1.7.2** — `lib.rs` `#[cfg(debug_assertions)]` writes `apps/desktop/src/app/_bindings.ts`; `tests/bindings_export.rs` is the deterministic CI gate (2026-05-11, commit 567073b — runtime export, not build.rs, per Spike D's documented correction)
- [x] **S1.7.3** — Wired each command to its service via `_impl` split; 12 happy + 1 unhappy tests (2026-05-11, commit c311da5)

### [x] Step 1.8a — Angular shell UI (2026-05-11)

5 atoms: `list_tasks` Rust command, frontend foundations (ngrx-signals + Geist + Mozart tokens), IPC/zod boundary + signalStores + shortcut infra (TDD), AppShell 3-panel + sidebar + workspace items, smoke fixture + CLAUDE.md conventions. Commits: 76ae293, 95f02fc, 2e018f6, cdfdf13, f345ec4.

### [x] Step 1.8b — Shell polish + Agent streaming MVP (2026-05-11)

5 atoms: window 1400×900 + custom titlebar + macOS variant + window perms; ShellStore + center-panel routing (TDD); sidebar 260px + flatter pills + drop archive slot; agent streaming + `AgentRunTerminated` tauri-specta event + ChatPanel + error banner with Retry; Add Repo + Create Workspace dialogs + sidebar wiring + ⌘N/⌘R. Q1–Q8 locked in `tmp/done-plans/audit-plan.md`. Commits: 1bc8f29, ffbd2a0, cce11ba, 6852b32, 2e89a52, 2c33f74, c799e54, e928bc7.

### [ ] Step 1.9 — Onboarding flow + tour repo

5 onboarding screens (DESIGN.md D3) + `mozart-quickstart-demo` external repo + bundled snapshot fallback (PLAN-v0.0.1.md A7). Atomize after 1.8.

### [ ] Step 1.10 — Phase 1 acceptance gate

PLAN-v0.0.1.md L555-565 checklist runs through manually. Required before any Phase 2 work.

---

## 4. Phase 2 (Lane B / C / D — independent of Lane A internals after 1.6)

### Lane B — Public surfaces

- [ ] Step 2.1 — Astro landing OR Analog.js (decision lives in PLAN-v0.0.1.md A3 + TODO §10 below). Hero + 3 features + download CTA → `mozart.build`.
- [ ] Step 2.2 — Angular web + Clerk OAuth → `app.mozart.build`. Routes `/login`, `/sso-callback`, `/downloads` (gated, platform-detected, SHA256 displayed).

### Lane C — Telemetry

- [ ] Step 2.3 — `telemetry.rs` PostHog outbox (D10 + D14 + A6 + Q4). First-launch opt-out banner. Anonymous `device_id` only.

### Lane D — Distribution

- [ ] Step 2.4 — CI matrix (3 OS) + `release.yml` + `SHA256SUMS` + GitHub Releases. T1 + T2 + T3 + P1.

### Phase 2 acceptance gate

- [ ] Step 2.5 — PLAN-v0.0.1.md L626-635 checklist. Tag `v0.0.1` and ship.

---

## 5. Deferred future features (post-v0.0.1, not in any lane yet)

These are documented so the next agent does not re-derive them. Allowed files + acceptance criteria live in `specs/plan-v0.0.1-2.md` § 7 (F0–F6).

- [x] **F0** — Doc-only: lift canonical vocabulary into `CLAUDE.md` + fix `AGENTS.md` pointer. Applied 2026-05-11, commit 41a951f.
- [ ] **F1** — Workspace archive state column (`archived_at INTEGER`, additive migration)
- [ ] **F2** — Multiple threads per workspace (drop UNIQUE, add `threads.title`)
- [ ] **F3** — Candidate Solution read-only view (`commands/candidates.rs`, no schema migration)
- [ ] **F4** — Merge Decision entity (`merge_decisions` table + `commands/merge.rs`)
- [ ] **F5** — Multi-provider routing (`trait LlmProvider` + adapters; reinstates D5 from PLAN.md). **Rewrite contract:** `specs/plan-v0.0.1-2.md` § 6.5.1 — F5 REWRITES `parse_line`, does NOT extend Step 1.4's token-only logic. Locked by `/discussion` 2026-05-10 (D1.4-B).
- [ ] **F6** — Coordination intelligence layer (v0.3+ vision; not sized)

Other deferred items still tracked from PLAN-v0.0.1.md (unchanged):

- [ ] macOS notarization (Apple Dev account, ~$99/yr) → v0.0.2
- [ ] Windows EV code signing (~$200-500/yr) → v0.2
- [ ] Tauri auto-updater plugin → v0.2
- [ ] In-app GitHub repo cloning → v0.2 (per cleared PLAN.md / D2)
- [ ] Identified telemetry (Clerk session bridge to desktop) → v0.0.2 if cohort data warrants
- [ ] Setup scripts per repo + files-to-copy rules → v0.0.2 (D16 future)
- [ ] Linear integration → v0.3+
- [ ] Cross-platform E2E in CI → v0.0.2 (v0.0.1 is Linux-only smoke + manual Win/Mac QA)
- [ ] Coverage threshold gate in CI → v0.0.2 (v0.0.1 enforces existence, not %)

---

## 6. Validation gates (run on every commit)

```sh
# Rust
cd apps/desktop/src-tauri && cargo check && cargo test --tests && cargo clippy --all-targets -- -D warnings

# JS/TS
pnpm nx run-many -t typecheck lint test

# Naming guard
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"   # expect 0 lines
```

Stuck > 30 min on a gate? Stop. Return to `/discussion`. Decompose finer. Never push harder on a broken approach.

---

## 7. Commit discipline

- One logical commit per atom (`S1.x.y`). Never `git add .` — stage only the atom's `allowed_files`.
- Format: `feat(M{Step}.{atom}): <what>` for features, `fix(M{Step}.{atom}): <what>` for fixes, `chore(M{Step}.{atom}): <what>` for tooling.
- `includeCoAuthoredBy: false` (set in `.claude/settings.json`).
- Example: `feat(M1.4.1): claude_cli StreamEvent enum + parse_line` (matches the cadence used in the recent `feat(M1.3): db CRUD — workspaces + threads` commits).

---

## 8. Workflow

```
/discussion → /plan → /atomize → /implement → (gate) → /commit
```

- `/discussion` — clarity before code. Never edits source. Writes `.context/context.md`.
- `/plan` — codebase analysis + research → plan in `tmp/ready-plans/`.
- `/atomize` — converts plan into `TASKS.md`: atomic, with allowed/forbidden files, deps, acceptance.
- `/implement` — **one atom at a time**, stops at the man-in-the-middle checkpoint between atoms.
- Validation gate after each atom. Commit only after gate is green.

---

## 9. Source-of-truth pointers (read these, in this order)

| What | Where | Why read it |
|---|---|---|
| **Status + next step** | `docs/specs/plan-v0.0.1-2.md` | This document is the running plan after Step 1.3 |
| **Canonical concepts** | `CLAUDE.md` § "Product vocabulary" + `specs/mozart-worktree-swarm-design-synthese.md` | The 8-term model the UI must respect |
| **Architecture & D-decisions** | `docs/PLAN-v0.0.1.md` | Every locked decision (D1–D23, A1–A7, Q1–Q4, T1–T3, P1) |
| **Design tokens & components** | `docs/DESIGN.md` | Layout, type, status colors, 11 component specs |
| **Test plan (canonical)** | `docs/timothy-main-eng-review-test-plan-20260509-072442.md` | E2E + Vitest + cargo-test scope (D23) |
| **Atom backlog** | `TASKS.md` (root) | What's checked / what's next at atom level |
| **Conductor reference** | `docs/competitors/conductor/docs/` | Read-only mental model. Do not edit. |
| **Pane reference** | `docs/competitors/pane/` | Read-only inspiration for `.claude/` layout. Do not copy code (AGPL-3.0). |

---

## 10. Open product/architecture questions (not blocking Lane A 1.4–1.7)

These do not block Lane A continuation. Resolve before the step that needs them.

- **Landing stack:** Astro (PLAN-v0.0.1.md A3) vs Analog.js (`competitors/pane/...` suggests Angular-only). Trigger: start of Step 2.1.
- **Branch rename UX:** when does `agent/wip-{shortid}` get renamed to a task-derived slug? Currently planned at "after first run" — confirm in Step 1.6 / 1.7.
- **Repo location for the Mozart codebase itself:** PLAN-v0.0.1.md L884 still asks. Currently at `~/accelerate_growth_with/mozart/`. Confirm or move before any user-facing distribution work.
- **Apple Dev account enrollment:** ~24h lead time. Start whenever to unblock v0.0.2 notarization.

---

## 11. House rules (carried from prior versions, still load-bearing)

### One-Way Rule

> "Si deux hooks existent pour faire X, le LLM en créera un troisième." — Pane blog-2

Before adding any pattern: grep the codebase for similar patterns. If found → extend, do not duplicate. If not found → document the new canonical pattern in `CLAUDE.md` before merging.

### Death Loop Prevention

If a single atom blocks > 30 min:

1. STOP the run.
2. Return to `/discussion` (not `/implement`).
3. Decompose finer — the atom is too big.
4. Never push harder on a broken approach.

### Vocabulary

| ❌ Never in user-visible strings | ✅ Always in user-visible strings |
|---|---|
| worktree / `worktree_path` | Workspace |
| `branch_name` (technical) | (often hidden; if shown, "Branch: …" subtitle only) |
| detached HEAD | (caught earlier and refused, never surfaces) |
| `git worktree add` | "Create workspace" |
| `agent/wip-{shortid}` | (auto-renamed; never shown raw) |
| commit checkpoint sha | "Snapshot before this run" |

---

## 12. Recent decisions (delta since the prior TODO)

- **D17** — CLAUDE.md gains a "Product vocabulary" section.
- **D18** — Worktrees live at `~/.mozart/worktrees/{workspace_id}/`. Locked.
- **D19** — Workspace archive is workspace-level. Schema additive in F1.
- **D20** — Threads stay UNIQUE-per-workspace in v0.0.1; no UI surface.
- **D21** — No `Candidate` or `MergeDecision` table in v0.0.1.
- **D22** — Step 1.x is the authoritative milestone numbering. M1–M13 retired.
- **D23** — `timothy-main-eng-review-test-plan-20260509-072442.md` is the canonical test plan.

Full reasoning + acceptance criteria in `specs/plan-v0.0.1-2.md`.
