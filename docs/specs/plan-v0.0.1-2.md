# Plan: Mozart v0.0.1 — Continuation (post-Step-1.3)

**Status:** Active. Lane A 2/8 shipped (Steps 1.2 + 1.3). Lane A continues from Step 1.4.
**Date:** 2026-05-10
**Supersedes:** N/A — extends [`PLAN-v0.0.1.md`](../PLAN-v0.0.1.md). Step 1.1–1.3 sections of that plan are now historical; this document is the running source of truth for the remaining Lane A steps.
**Reviewer:** /plan-eng-review (Opus 4.7), Conductor cross-check 2026-05-10.

> **For another agent picking this up:** read §0 (status), §3 (canonical model), §6 (atomic tasks), §7 (next step). Then implement one atom only. Do not auto-chain.

---

## 0. Current status (one screen)

```
LANE A — Phase 1 desktop core (8 steps, 2 shipped, 6 remaining)
─────────────────────────────────────────────────────────────────
[x] 1.1  Repo bootstrap (Nx + pnpm + Tauri scaffolded)
[x] 1.2  Spikes A–E + Cargo bootstrap + root scripts          ← shipped, see tmp/done-plans/02-step-1-2-spikes.md
[x] 1.3  DB layer (migrations + 9 row structs + CRUD)         ← shipped, see tmp/done-plans/03-step-1-3-db.md
[ ] 1.4  claude_cli.rs — subprocess + stream parser           ← NEXT
[ ] 1.5  sandbox.rs — git_checkpoint / capture_diff / discard
[ ] 1.6  worktree.rs + branch_name.rs + git_query.rs
[ ] 1.7  Tauri commands wiring + tauri-specta TS bindings
[ ] 1.8  Angular shell UI (3-panel + 11 components)
[ ] 1.9  Onboarding flow (5 screens) + tour repo

LANE B–D (Phase 2) — landing, web+Clerk, telemetry, CI/Releases
remain queued. Independent of Lane A internals after 1.1.
```

What is provably real today (verified by reading the repo):
- `apps/desktop/src-tauri/migrations/001_init.sql` — 9 tables + `schema_version` + 6 indexes.
- `apps/desktop/src-tauri/src/db/` — `mod.rs`, `models.rs`, plus 8 CRUD modules (`repos`, `tasks`, `workspaces`, `threads`, `agent_runs`, `agent_events`, `workspace_changes`, `outbox`, `config`). All with round-trip tests.
- `apps/desktop/src-tauri/src/error.rs` — `AppError` enum, `serde + specta::Type`.
- `apps/desktop/src-tauri/src/spikes/{a,b,c,d,e}` — five `#[ignore]`-gated POCs proving worktree, SQLite WAL, Claude CLI streaming, tauri-specta bindings, portable-pty.
- 34+ Rust tests, all passing in-memory; `cargo test --tests db::*` is the green gate.
- `TASKS.md` — atom-level execution log; S1.3.1 → S1.3.8 closed, S1.3.9 final gate to be ticked when 1.4 starts (so the gate cmd runs once).

What does **not** yet exist in code:
- No Tauri commands registered. `lib.rs` is the boilerplate `Builder::default().setup(...).run(...)`.
- No `tauri-specta` build-step output (`apps/desktop/src/app/_bindings.ts` is gitignored / not generated yet outside the Spike D check).
- No claude subprocess wrapping outside Spike C.
- No worktree/branch logic outside Spike A.
- No Angular UI yet beyond the Nx-generated shell.
- No `~/.mozart/` data dir convention codified anywhere.

---

## 1. What still needs verification (run before resuming Lane A)

A returning agent should confirm these green gates before touching any code:

```sh
# Validation gate (must all pass)
cd apps/desktop/src-tauri && cargo check                                     # clean compile
cd apps/desktop/src-tauri && cargo test --tests                              # all in-memory db tests pass
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings       # no warnings
pnpm nx lint desktop                                                         # angular shell still lints
pnpm nx run-many -t typecheck                                                # ts project refs intact
```

If `cargo test --tests` reports < ~34 tests, regenerate or re-run with `-- --nocapture` to catch a flaky import. Spike tests are `#[ignore]` and require external state (git, claude binary); not part of the gate.

Naming check (must produce zero hits):

```sh
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts" 2>/dev/null
# any hit outside docs/competitors/conductor/ is a regression of the Naming Lock
```

---

## 2. Concept audit — what we kept, clarified, and parked

### What we kept (unchanged)

- The 9-table D16 schema and the `1 task = 1 workspace = 1 thread = N agent runs = 1 final diff` execution model for v0.0.1.
- All locked decisions D1–D16, A1–A7, Q1–Q4, T1–T3, P1 from PLAN-v0.0.1.md.
- The `agent/wip-{shortid}` initial branch placeholder and the slug+`git check-ref-format` rename pattern (`branch_name.rs`).
- The Naming Lock (mozart / mozart.build / `build.mozart.desktop` etc.).
- The vision in `docs/specs/mozart-worktree-swarm-design-synthese.md`. It is internally consistent with Conductor and remains the long-term north star.

### What we clarified after the Conductor cross-check

- **Workspace is the user-facing primitive. Working tree (a.k.a. `worktree_path`) is internal.** This was already the vision; we are writing it into CLAUDE.md so future agents anchor on it.
- **Task is a deliberate Mozart-only layer above Workspace.** It carries user intent and enables the v0.1 "many candidate workspaces per task" vision. In v0.0.1 it is 1:1 with workspace, which can read as redundant; the Task entity stays so the v0.1 schema is purely additive.
- **Thread is reserved for "multiple chats per workspace" (Conductor's tabs).** v0.0.1 enforces UNIQUE workspace_id; v0.0.2 relaxes it. Don't expose threads in the v0.0.1 UI.
- **Candidate Solution is not a separate table.** It is the projection `(workspace × latest workspace_changes row) grouped by task_id`. The `candidate` view shows up at v0.1 when `tasks → workspaces` becomes 1:N.
- **Merge Decision is manual in v0.0.1.** The Commit / Discard / Merge / Archive buttons are the surface; persistence as an entity is a v0.1 concern.

### What we parked (future tasks documented, no code now)

- Workspace archive lifecycle vs `tasks.status='archived'` clash — additive schema fix.
- `~/.mozart/worktrees/{workspace_id}/` vs `<repo>/.worktrees/<short_id>/` — locked here (see §4) and applied in Step 1.6.
- Multiple threads per workspace (relax UNIQUE).
- Candidate comparison view (read-only over existing tables).
- Merge Decision entity (post-v0.0.1).
- Multi-provider routing (`LlmProvider` trait + adapters; v0.0.2 per D5 / D12).

---

## 3. Canonical Mozart terminology (reference)

This is the authoritative concept list. All other docs should defer to it. Same content gets pasted into CLAUDE.md so it loads with every session.

| # | Term | Lives as (DB) | Shown in UI as | Hidden from UI? |
|---|---|---|---|---|
| 1 | **Project** | `repos` row | "Project" or "Repository" (synonyms) | no |
| 2 | **Task** | `tasks` row | "Task" — the user-stated intent | no |
| 3 | **Workspace** | `workspaces` row | "Workspace" — isolated execution attempt + reviewable diff | no |
| 4 | **Thread** | `threads` row | "Chat" — v0.0.1 implicit (1:1 with workspace, no UI surface yet) | mostly hidden |
| 5 | **Agent Run** | `agent_runs` row | "Run" / conversation turn | no |
| 6 | **Workspace Changes** | `workspace_changes` row | "Diff" / "Changes" | no |
| 7 | **Candidate Solution** | derived view: workspaces in same task_id × latest workspace_changes | "Candidate" — appears at v0.1, hidden in v0.0.1 | partial |
| 8 | **Merge Decision** | manual buttons in v0.0.1; future entity in v0.1 | "Commit / Discard / Merge / Archive" | no |
| — | **Working tree** | `workspaces.worktree_path` column | — | **yes, never** |
| — | **Branch** | `workspaces.branch_name` / `workspaces.base_branch` | shown only as a small subtitle on a Workspace card; never user-editable in v0.0.1 | partial |

**Forbidden in user-visible strings (UI labels, error toasts, copy):** `worktree`, `branch_name`, `base_branch`, `worktree_path`, `agent/wip-…`, `detached HEAD`, `git worktree add`, `HEAD~1`, `checkpoint sha`.

**Allowed in dev-only strings (logs, inline diagnostic banners marked Dev):** all of the above. The check is on what reaches users in Onboarding / Settings / Dialog / Toast surfaces, not on logs.

ASCII data flow:

```
Project (repos)
   │
   └── Task (tasks)                  ← user intent
         │
         └── Workspace (workspaces)  ← isolated execution attempt
               │   └─ branch_name
               │   └─ base_branch
               │   └─ worktree_path  (internal)
               │
               └── Thread (threads)            ← v0.0.1: 1:1
                     │
                     └── Agent Run (agent_runs)
                           │
                           ├── Agent Events (agent_events)         ← stream log (replay/debug)
                           └── Workspace Changes (workspace_changes) ← diff snapshot per run

(Candidate Solution at v0.1 = group of Workspaces sharing a task_id, ranked by their workspace_changes.)
```

---

## 4. Decisions made from the Conductor comparison

Numbered to extend PLAN-v0.0.1.md's decision audit trail.

| # | Decision | Reasoning | Status |
|---|----------|-----------|--------|
| **D17** | **CLAUDE.md gains a "Product vocabulary" section** with the canonical 8-term model from §3. The implementing agent reads CLAUDE.md every session, so the vocabulary anchors there. | Lane A docs were missing the load-bearing concept layer; agents were reverse-engineering it from PLAN-v0.0.1.md and the vision doc. | **Documented as F0 atomic doc task (§7); not applied this pass — this audit is read-only on root-level files (CLAUDE.md / AGENTS.md). Apply F0 before Step 1.7 to avoid drift.** |
| **D18** | **Worktree on-disk location: `~/.mozart/worktrees/{workspace_id}/`.** Not `<repo>/.worktrees/<short_id>/`. | Centralized per-app data dir mirrors Conductor's pattern (`~/Library/Application Support/com.conductor.app`), keeps the user's repo tree clean, sidesteps a class of `.gitignore`-policing bugs. Step 1.6 uses this path. | Locked here; applied in Step 1.6 atom. |
| **D19** | **Workspace archive is a workspace-level concern, not a task-level one.** Status enum gains `archived` (additive). `tasks.status` stays `active|archived` for **task-level** archive (the user marked the intent done; workspaces underneath may still be alive). `workspaces.deletion_intent INTEGER` is repurposed as the v0.0.1-era archive flag and renamed conceptually (DB column kept for now to avoid migration churn). | Conductor archives workspaces; users don't think in "task-archived." Two-level archive is correct (you can park a Workspace without finishing the Task). | Documented now; archive UX wiring is part of Step 1.8. |
| **D20** | **Threads stay schema-unique-per-workspace in v0.0.1; no UI surface.** Step 1.7 commands assume 1:1 traversal `workspace → thread`. The `list_runs(workspace_id)` Tauri command takes a workspace_id and resolves the thread internally. | Don't surface a concept users don't need yet. v0.0.2 relaxes UNIQUE and adds a "new tab" UI per Conductor's pattern. | Locked. Step 1.7 enforces the lookup pattern. |
| **D21** | **No `Candidate` or `MergeDecision` table in v0.0.1.** Candidate is the read-only projection (workspaces in same task × latest workspace_changes). Merge Decision is buttons + telemetry events. | Schema-additive when needed; no migration in v0.0.1. | Locked. |
| **D22** | **Single source of milestone numbering: `Step 1.x` (PLAN-v0.0.1.md).** The `M1–M13` numbering in `docs/TODO.md` and `AGENTS.md` is retired. Files using it are either rewritten (TODO.md) or moved to `docs/archived/` (mozart-implementation-flow.md was already archived). AGENTS.md gets the dangling pointer fixed. | Three numbering systems (M, Step, S-atom) was creating cross-doc drift. Step + S-atom is the surviving pair. | Applied this pass. |
| **D23** | **`docs/timothy-main-eng-review-test-plan-20260509-072442.md` is the canonical test plan.** `docs/test-plan-v0.0.1.md` is the older copy from the gstack import. Mark the older one superseded with a header pointer; keep on disk as history (don't delete). | Two test plans with overlapping content invites drift. Mark canonical. | Applied this pass. |

---

## 5. Risks & anti-breaking-change notes

### Risks if Lane A continues without applying this plan

| Risk | What goes wrong |
|---|---|
| Implementing agent reads PLAN-v0.0.1.md without the canonical vocabulary | Likely renames `Workspace`/`Task` mid-implementation, or surfaces `worktree_path` in a Tauri command response. Hard to walk back without a Tauri-specta-driven TS rebuild. |
| Worktree location not locked before Step 1.6 | First Step 1.6 commit silently picks `<repo>/.worktrees/`. Switching to `~/.mozart/worktrees/` later is a worktree migration on every existing user. Not breaking for v0.0.1 (no users yet) but an annoying chore. |
| `M-numbering` left in TODO.md | The next agent picks the M-numbering thinking it's authoritative, drifts away from the Step-numbering, breaks `docs/PLAN-v0.0.1.md`'s Lane structure. |
| Workspace archive baked into `tasks.status` | Step 1.8 archive button maps to `tasks.status='archived'`; v0.1 needs to undo + add `workspaces.status='archived'`. Cheap to fix at v0.1 if the schema is purely additive, expensive if Step 1.8 commits the wrong action. |

### Anti-breaking-change rules (apply to every Lane A atom from here)

1. **Any new Tauri command must name fields by canonical concept** (workspace_id / task_id / run_id / change_id). No `worktree_path`, no `branch_name`, no `agent/wip-…` in command return shapes.
2. **Schema changes are additive only** until v0.0.2. Never `DROP COLUMN`, `RENAME COLUMN`, or change a UNIQUE constraint inside v0.0.1.
3. **The vocabulary in CLAUDE.md is the contract.** If a piece of code introduces a new noun the user will see, document it in CLAUDE.md before merging.
4. **Step 1.6 worktrees go to `~/.mozart/worktrees/{workspace_id}/`.** No exceptions.
5. **Spikes never become production code by accident.** If a spike's pattern is needed, copy it into a new module with explicit naming + tests; don't `cfg`-flip the spike.

---

## 6. Updated implementation sequence (Lane A 1.4 → 1.9)

For each step the **atomic** sub-tasks below should be transcribed into `TASKS.md` before `/implement` runs. They are sized at the same granularity as the S1.3.x atoms that just shipped. Atoms intentionally leave the agent room to ask one focused clarifying question per atom; nothing here is scripted minute-to-minute.

### Step 1.4 — `claude_cli.rs` (NEXT — current focus)

Goal: spawn a `claude` CLI subprocess against a workspace's `worktree_path`, parse stdout into typed `StreamEvent`s, persist `agent_events` rows, emit a Tauri Channel of events to the UI, and return a final `AgentRun` row update.

#### Atom S1.4.1 — `StreamEvent` enum + `parse_line`

- **dependencies:** S1.3.* (DB layer)
- **parallelizable:** with S1.4.2
- **allowed_files:**
  - `apps/desktop/src-tauri/src/claude_cli/mod.rs` (new — declares the module + `StreamEvent`)
  - `apps/desktop/src-tauri/src/claude_cli/parser.rs` (new — `parse_line(s: &str) -> Result<StreamEvent, AppError>`)
  - `apps/desktop/src-tauri/src/lib.rs` (add `pub mod claude_cli;`)
- **forbidden_files:** any other `src/` file, `migrations/`, `commands/`
- **acceptance:**
  - `enum StreamEvent { StreamToken { text }, ToolCall { name, args_json }, CliOutput { line }, StatusUpdate { status }, Error { message } }`
  - Derives `Debug, Clone, Serialize, Deserialize, specta::Type`
  - Variant naming aligns with the `agent_events.event_type` enum strings (`stream_token | tool_call | cli_output | status_update | error`)
  - `parse_line` accepts the `claude -p ... --output-format=stream-json --include-partial-messages` line shape validated by Spike C
  - Unknown JSON shapes → `StreamEvent::CliOutput { line }` (lossless fallback, never panic)
  - Tests: ≥6 — one per known shape + one for lossless fallback

#### Atom S1.4.2 — `claude_cli::version_check` + `detect_installed`

- **dependencies:** none (pure subprocess)
- **parallelizable:** with S1.4.1
- **allowed_files:**
  - `apps/desktop/src-tauri/src/claude_cli/install.rs` (new)
- **acceptance:**
  - `fn check_installed() -> ClaudeInstall { Installed { version: String } | Missing }`
  - Uses `tokio::process::Command::new("claude").arg("--version")` with a 3 s timeout
  - Treats spawn-error / non-zero exit / parse-error all as `Missing` (don't surface OS-level details to the user)
  - Tests: covered by Spike E pattern; in this atom add unit tests around the parsing branch with a fake stdout fixture

#### Atom S1.4.3 — `claude_cli::spawn_run`

- **dependencies:** S1.4.1, S1.4.2, S1.5.1 (`sandbox::git_checkpoint`)
- **allowed_files:**
  - `apps/desktop/src-tauri/src/claude_cli/runner.rs` (new)
- **acceptance:**
  - Public surface: `async fn spawn_run(workspace: &Workspace, run: &AgentRun, channel: Channel<StreamEvent>, db: &DbState) -> Result<RunHandle, AppError>`
  - Sets `current_dir(&workspace.worktree_path)`, `kill_on_drop(true)`, captures stdout + stderr piped
  - Calls `sandbox::git_checkpoint` first, stores returned sha into `agent_runs.checkpoint_sha`
  - **NEVER** passes `--dangerously-skip-permissions`
  - Spawns a parser task that drains stdout line-by-line → `parse_line` → emit on `channel` AND insert `agent_events` row in DB
  - On exit: calls `agent_runs::mark_ended` and `sandbox::capture_diff` → inserts `workspace_changes`
  - Cancellation: `RunHandle.cancel()` triggers SIGTERM, parser task drains residual lines, marks status `stopped`
  - Tests: 4 — happy path with mocked `claude` (use `echo` shim or a mock binary fixture in `tests/fixtures/`), cancel mid-stream, non-zero exit, missing `claude` binary

#### Atom S1.4.4 — Step 1.4 final gate

- **dependencies:** S1.4.1, S1.4.2, S1.4.3
- **acceptance:**
  - `cargo test --tests` includes the 4 new modules and remains green
  - `cargo clippy --all-targets -- -D warnings` clean
  - No new files touched outside `apps/desktop/src-tauri/src/claude_cli/`, `lib.rs`, `Cargo.toml`

### Step 1.5 — `sandbox.rs`

Goal: pre-run / post-run / rollback guardrails (D13).

#### Atom S1.5.1 — `git_checkpoint(workspace_path) -> Result<String, AppError>`

- **allowed_files:**
  - `apps/desktop/src-tauri/src/sandbox/mod.rs` (new)
  - `apps/desktop/src-tauri/src/sandbox/checkpoint.rs` (new)
  - `apps/desktop/src-tauri/src/lib.rs` (add `pub mod sandbox;`)
- **acceptance:**
  - Stages everything (`git add -A`) then `git commit --allow-empty -m "checkpoint before run"` then `git rev-parse HEAD`
  - Returns the resulting sha as `String`
  - Tests: in a `tempfile::tempdir` `git init`-ed repo, returns a non-empty sha; idempotent (running twice succeeds with `--allow-empty`)

#### Atom S1.5.2 — `capture_diff(workspace_path, base_sha) -> Result<DiffSummary, AppError>`

- **allowed_files:**
  - `apps/desktop/src-tauri/src/sandbox/diff.rs` (new)
- **acceptance:**
  - `struct DiffSummary { diff_text: String, files_added: i64, files_modified: i64, files_deleted: i64 }`
  - Implementation = `git diff <base_sha> HEAD --numstat` for counts + `git diff <base_sha> HEAD` for unified text
  - Empty diff returns zeros, no error
  - Tests: small fixture repo with adds/edits/deletes asserts counts

#### Atom S1.5.3 — `discard_changes_to(workspace_path, sha) -> Result<(), AppError>`

- **allowed_files:**
  - `apps/desktop/src-tauri/src/sandbox/reset.rs` (new)
- **acceptance:**
  - `git reset --hard <sha>` inside the workspace tree only (defense-in-depth: assert path under `~/.mozart/worktrees/`)
  - Returns `AppError::Validation` if path does NOT live under the canonical worktrees root (D18 enforcement)
  - Tests: round-trip happy path; rejection when called on a path outside the canonical root

### Step 1.6 — `worktree.rs` + `branch_name.rs` + `git_query.rs`

Goal: D16 worktree lifecycle + branch slug + repo validation.

#### Atom S1.6.1 — `branch_name.rs` (`make_initial_branch`, `make_task_branch`)

- **allowed_files:** `apps/desktop/src-tauri/src/branch_name.rs` (new), `lib.rs` (add `pub mod branch_name;`)
- **acceptance:**
  - `make_initial_branch(short_id) -> String` returns `agent/wip-{short_id}`
  - `make_task_branch(title, short_id) -> Result<String, AppError>` slugifies + truncates 40 chars + gates with `git check-ref-format`
  - Falls back to `make_initial_branch` if slug invalid; emits `tracing::warn!`
  - Tests: 6 — happy slug, all-special-char title, 200-char title (truncated), non-ASCII title, leading hyphen, `git check-ref-format` reject

#### Atom S1.6.2 — `git_query.rs` (`list_branches`, `validate_repo`, `check_git_available`)

- **allowed_files:** `apps/desktop/src-tauri/src/git_query.rs`, `lib.rs`
- **acceptance:**
  - `validate_repo(path)` — checks `.git` exists, NOT a nested repo (no `.git` inside subdirs of selected path), NOT detached HEAD
  - Returns typed `RepoIssue` enum on rejection: `NestedRepo | DetachedHead | NotARepo | LfsRequired | UnsupportedSubmodules`
  - LFS detection: best-effort via `git lfs ls-files` if the binary is on PATH; otherwise warn-only
  - Tests: 5 — happy path repo, nested repo refuse, detached HEAD refuse, missing .git refuse, dirty tree warns-only

#### Atom S1.6.3 — `worktree.rs` (create / remove / list)

- **dependencies:** S1.6.1, S1.6.2
- **allowed_files:** `apps/desktop/src-tauri/src/worktree.rs`, `lib.rs`
- **acceptance:**
  - `create(repo_path, base_branch, short_id) -> Result<WorktreeHandle, AppError>` runs `git worktree add -b <make_initial_branch(short_id)> ~/.mozart/worktrees/{workspace_id}/ <base_branch>` (D18)
  - `remove(workspace_id) -> Result<(), AppError>` runs `git worktree remove --force` then `rm -rf` if dir lingers (defensive)
  - `cleanup_orphans(db) -> Result<usize, AppError>` runs at startup; reconciles DB rows with on-disk worktrees; returns count cleaned
  - `WorktreeHandle { workspace_id, worktree_path, branch_name }` is the internal handoff shape; never exits Rust
  - Tests: integration tests require a real git binary, so mark `#[ignore]` and run via `cargo test --ignored worktree`. Unit-testable parts (path computation, args assembly) are tested without git.

#### Atom S1.6.4 — `create_workspace` orchestrator

- **dependencies:** S1.6.3, S1.5.1, all of S1.3
- **allowed_files:** `apps/desktop/src-tauri/src/workspace_service.rs` (new) — orchestration only, no DB schema changes
- **acceptance:**
  - `pub async fn create_workspace(db: &DbState, repo_id: &str, base_branch: &str, task_text: &str) -> Result<Workspace, AppError>`
  - Order: validate repo → insert Task → insert Workspace (status=initializing) → call `worktree::create` → on success, update Workspace.status=ready + insert Thread (1:1) → return Workspace
  - On any failure after the worktree is created: `worktree::remove` then propagate the error (no orphan dirs)
  - Tests: 3 — happy path, validation refuse path, mid-step failure rollback

### Step 1.7 — Tauri commands wiring + tauri-specta

Goal: lift the Rust API to typed Angular TS.

#### Atom S1.7.1 — Commands skeleton

- **allowed_files:** `apps/desktop/src-tauri/src/commands/mod.rs` (new), `lib.rs`
- **acceptance:** declares 9 commands (see PLAN.md L122-130) but only stubs them (`unimplemented!()` is fine for atoms 1.7.2+). Annotates each with `#[tauri::command]` + `#[specta::specta]`. `lib.rs` registers them via `tauri::generate_handler!`. **Public field names use canonical vocabulary only** (`workspace_id`, `task_id`, `run_id`, `change_id`, `prompt`, `status`).

#### Atom S1.7.2 — `build.rs` specta export

- **allowed_files:** `apps/desktop/src-tauri/build.rs`, `apps/desktop/src/app/_bindings.ts` (regenerated, gitignored)
- **acceptance:** `tauri-specta` exports a typed `commands` and `events` module to `apps/desktop/src/app/_bindings.ts`. CI gate: `pnpm nx build desktop` regenerates bindings without diffing.

#### Atom S1.7.3 — Wire each command to its service

- **dependencies:** S1.4 + S1.5 + S1.6 + S1.7.1
- **allowed_files:** `apps/desktop/src-tauri/src/commands/*.rs`
- **acceptance:** every command has a `cargo test`-level happy-path test; `unimplemented!()` removed; round-tripped through `_bindings.ts` and consumed by an Angular smoke service test (Step 1.8 work).

### Step 1.8 — Angular shell UI

Goal: 11 components from PLAN.md L487-498. Not atomized in this plan (large scope; will get its own ready-plan after Step 1.7 lands).

### Step 1.9 — Onboarding flow + tour repo

Goal: 5 onboarding screens (DESIGN.md D3) + bundled snapshot. Not atomized in this plan.

### Step 1.10 — Phase 1 acceptance gate

Manual run-through of `PLAN-v0.0.1.md` L555-565. Required before any Phase 2 atom starts. Not code work, but a hard checkpoint.

---

## 6.2 Phase 2 (Lane B / C / D — still part of v0.0.1, queued behind Phase 1 gate)

Phase 2 is **inside the v0.0.1 release**. It does not get atomized in this plan — each step gets its own ready-plan after Phase 1 closes — but the scope, dependencies, and design risks are nailed here so the next agent doesn't re-derive them.

### Step 2.1 — Public landing (Lane B-1)

- **Goal:** marketing surface at `mozart.build`. Hero + 3 features + GIFs + cross-platform download CTA + email lead capture.
- **Key open question (resolve before atomizing):** Astro (PLAN-v0.0.1.md A3) vs Analog.js (TODO.md §4). Trigger this decision via `/discussion` at start of Step 2.1. Recommended path: pick whichever lets `libs/design-tokens` (or its TailwindCSS-v4 equivalent) be shared with `apps/web` cleanly. The PLAN-v0.0.1.md A3 picks Astro; TODO.md §10 leaves the door open.
- **Allowed files (when atomized):** `apps/landing/**`, `libs/design-tokens/**` (or `tailwind.config.ts` shared root), `.github/workflows/landing.yml`
- **Forbidden files:** `apps/desktop/**`, `apps/web/**`, `apps/desktop/src-tauri/**`, anything under `libs/ui/`
- **Dependencies:** Step 1.1 (monorepo) only. Independent of Lane A internals.
- **Architectural acceptance** (not atom-level): static build < 1 s on simulated 3G; deploys to Cloudflare Pages root domain; email lead-capture POSTs to a documented endpoint (provider TBD; ConvertKit / Resend / direct PostHog event are all acceptable).

### Step 2.2 — Web app + Clerk OAuth (Lane B-2)

- **Goal:** authenticated `/downloads` page at `app.mozart.build` with platform-detection + SHA256 verify (PLAN-v0.0.1.md L583-590).
- **Allowed files:** `apps/web/**`, including `apps/web/src/app/services/clerk.service.ts` (per A4: no shared lib for Clerk wrap)
- **Forbidden files:** anything outside `apps/web/`
- **Dependencies:** Step 2.1 (so the landing → app handoff is testable end-to-end). Independent of Lane A.
- **Architectural acceptance:** Clerk hosted UI mounts; AuthGuard blocks `/downloads` when unauthed; logout returns to `/login`; cookies scoped to `app.mozart.build` subdomain.

### Step 2.3 — PostHog telemetry outbox (Lane C)

- **Goal:** anonymous opt-out telemetry from desktop (PLAN-v0.0.1.md L596-611). Outbox pattern (A6 + Q4) — survives offline.
- **Allowed files (when atomized):**
  - `apps/desktop/src-tauri/src/telemetry/**` (new)
  - `apps/desktop/src-tauri/src/lib.rs` (registration)
  - `apps/desktop/src-tauri/src/commands/telemetry.rs` (`track_event` Tauri command)
- **Forbidden files:** `migrations/**` (the `events_outbox` table already exists from Step 1.3 — DO NOT alter it), any UI module not directly tied to the opt-out banner
- **Dependencies:** Step 1.3 (events_outbox table) + Step 1.7 (Tauri command surface). NOT a blocker for Phase 1 acceptance gate.
- **Design risk:** WAL contention with the agent-write path. Mitigation locked in Q4 — separate writer task, single connection, busy_timeout 5000. Spike B already validated this at 3-table scale; production-scale validation happens in Step 2.3's atom-level tests.
- **Architectural acceptance:** drain task retries with backoff `5s → 30s → 2m → 10m → 1h`, drops events after 5 attempts, caps the outbox at 10 000 events; opt-out toggle in Settings makes `track_event` a no-op (verified by inspecting the outbox row count).

### Step 2.4 — CI matrix + GitHub Releases (Lane D)

- **Goal:** 3-platform build matrix + tagged releases with `SHA256SUMS` (PLAN-v0.0.1.md L613-623).
- **Allowed files:**
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `.github/PULL_REQUEST_TEMPLATE.md` (test-evidence requirement per TODOs item)
- **Forbidden files:** anything inside `apps/` or `libs/` — this step is CI-config-only.
- **Dependencies:** all of Phase 1 + Steps 2.1, 2.2, 2.3. Last lane to start.
- **Architectural acceptance:** matrix `ubuntu-latest / macos-latest / windows-latest` runs `pnpm exec nx affected -t lint test` + `pnpm exec nx run desktop:tauri-build`; Linux job additionally runs Playwright + tauri-driver smoke (T2); release workflow on `v*` tag uploads `.dmg / .exe / .AppImage / SHA256SUMS` to a GitHub Release.

### Step 2.5 — v0.0.1 acceptance gate

PLAN-v0.0.1.md L626-635 checklist run manually. Blocks `git tag v0.0.1`. Not code.

### Phase 2 — when to atomize

Each Step 2.x gets its own `tmp/ready-plans/` file when its blocking dependency closes:

```
Step 1.10 closed ──┬─→ Step 2.1 atomized → /implement
                   └─→ Step 2.3 atomized (independent of 2.1, depends only on 1.3 + 1.7)
Step 2.1 closed ───→ Step 2.2 atomized
Step 2.2 + 2.3 closed → Step 2.4 atomized
Step 2.4 closed ───→ Step 2.5 (manual)
```

---

## 6.5 Architectural foresight — how Lane A atoms preserve future feature headroom

This section makes explicit how the Step 1.4–1.7 atoms above are sized so that the F-tasks (post-v0.0.1) remain **purely additive**. If any of these mappings breaks during implementation, the implementing agent must stop and return to `/plan-eng-review` — preserving the headroom is a load-bearing acceptance criterion.

| Future task | Lane A atom that protects it | What the atom must NOT do |
|---|---|---|
| **F0 — vocabulary in CLAUDE.md** (doc atom, before Step 1.7) | All Step 1.7 atoms (`commands/**`) | Surface internal column names (`worktree_path`, `branch_name`) in command return shapes. Public field naming uses canonical concepts only. |
| **F1 — workspace archive state** (additive `archived_at`) | S1.6.4 `create_workspace` orchestrator + Step 1.8 archive UI (later) | Bake `tasks.status='archived'` as the workspace-archive trigger. Workspace archive is workspace-level (D19); Step 1.6.4 must not fold them. |
| **F2 — multi-thread per workspace** (drop UNIQUE) | S1.4.3 `spawn_run` + S1.7.3 `list_runs` command | Hard-code `threads.workspace_id` UNIQUE assumption in service code. The DB enforces UNIQUE; service code must traverse `workspace → thread` via `get_by_workspace().expect()` (still 1:1 in v0.0.1) so v0.0.2 can swap to `list_by_workspace().first()` without rewriting. |
| **F3 — Candidate Solution view** (read-only) | S1.6.4 + S1.3 schema (already shipped) | Couple `tasks` to `workspaces` 1:1 in service code. The schema is 1:N-ready; orchestrator code must accept that a single `task_id` can have multiple `workspaces` rows even if v0.0.1 UI shows one. |
| **F4 — MergeDecision entity** | Step 1.8 buttons + Step 2.3 telemetry | Bury merge intent in a free-text log. Telemetry events `merge_decision.{commit, discard, merge, archive}` should already carry `task_id + workspace_id + chosen_kind` so F4 can backfill from the event log. |
| **F5 — multi-provider routing** | S1.4.1 `StreamEvent` enum + S1.4.3 `spawn_run` | Make `claude` binary path / args / env shape spread across `claude_cli/**`. The `StreamEvent` enum must already be the canonical shape that future `LlmProvider` impls produce — not Claude-CLI-specific (e.g., no `tool_use_id` field shaped to Anthropic's exact JSON). Spike C tolerated any JSON; the Step 1.4.1 atom names the lossless `CliOutput { line }` fallback for the same reason. |
| **F6 — coordination intelligence layer** | All of Lane A | Place coordination logic anywhere outside a clearly-named future module. v0.0.1 has zero coordination logic; F6 lives in a yet-to-exist `apps/desktop/src-tauri/src/coordinator/**`. As long as Lane A doesn't put scheduling / fan-out / arbitration logic into `commands/**` or `claude_cli/**`, F6 stays clean. |

The discipline: at every atom's review checkpoint, the implementing agent sanity-checks the matching row above and confirms no headroom was burned. If a row's "What the atom must NOT do" is violated by an otherwise-good implementation, prefer rewriting the implementation over green-lighting the violation.

---

## 7. Future / parked tasks (not for v0.0.1)

These are documented now so the next implementing agent does not re-derive them. Each lives as a future ticket; do **not** start them inside Lane A unless F0 is called out.

### F0 — Lift canonical vocabulary into CLAUDE.md + AGENTS.md (documentation-only; do BEFORE Step 1.7)

This is a **documentation atom** — no source code changes. Apply it before Step 1.7 wires the Tauri commands, so the implementing agent uses canonical names from the start.

- **dependencies:** none
- **allowed_files:**
  - `CLAUDE.md` (root) — append a new section
  - `AGENTS.md` (root) — fix the broken pointer + add a one-line vocabulary teaser
- **forbidden_files:** any `.rs` / `.ts` / `.sql` / `apps/**/src/**` / `libs/**`
- **acceptance:**
  - **CLAUDE.md** gains a section titled `## Product vocabulary` (placed near the top, before "Layout" or after "Commands" — wherever an implementing agent will see it on a quick scan). Section contains:
    1. The 8-row canonical-concept table from `docs/specs/plan-v0.0.1-2.md` § 3 verbatim.
    2. The "Forbidden in user-visible strings" list verbatim.
    3. The ASCII data-flow diagram from § 3 verbatim.
    4. A one-line pointer: `Source of truth: docs/specs/plan-v0.0.1-2.md § 3 (canonical model). Vision narrative: docs/specs/mozart-worktree-swarm-design-synthese.md.`
  - **AGENTS.md** is updated:
    - The line `Milestones (M1–M13): docs/mozart-implementation-flow.md` is replaced with `Status: docs/specs/plan-v0.0.1-2.md · TODO: docs/TODO.md`
    - Any other `M1–M13` reference is rewritten in `Step 1.x` form (or pointed at `docs/specs/plan-v0.0.1-2.md`)
    - Add a single line under the existing "Conventions" section: `Concept vocabulary: see CLAUDE.md § "Product vocabulary".`
  - No removal of existing valid CLAUDE.md content (e.g., Spartan rules, Angular best-practices, Tauri rules). The change is **additive**.
- **tests/checks:**
  ```sh
  grep -c "Product vocabulary" CLAUDE.md            # expects 1
  grep -c "M1–M13\|mozart-implementation-flow" AGENTS.md   # expects 0
  grep -c "plan-v0.0.1-2.md" AGENTS.md              # expects ≥1
  ```
- **Trigger to start:** before any work on Step 1.7 (`commands/mod.rs`). Locking vocabulary before commands wire prevents `worktree_path`-shaped fields leaking into the typed TS surface.

### F1 — Workspace archive state (additive, post-Step-1.8)

- **allowed_files:**
  - `apps/desktop/src-tauri/migrations/002_archive_state.sql` (new — additive only)
  - `apps/desktop/src-tauri/src/db/workspaces.rs` (extend status enum docs; no behavior change required)
- **acceptance:**
  - Migration adds `archived_at INTEGER` column to `workspaces` (nullable; null = not archived)
  - Status enum documented to extend with `archived` (existing rows untouched)
  - CRUD: `archive(workspace_id, ts)`, `unarchive(workspace_id)`, `list_active()` filters out archived
  - Tests: 4 round-trip + filter
- **Trigger to start:** Step 1.8 archive button needs persistence.

### F2 — Multiple threads per workspace (v0.0.2)

- **allowed_files:** `migrations/003_multi_thread.sql`, `db/threads.rs`, `db/workspaces.rs`
- **acceptance:** drop UNIQUE on `threads.workspace_id`, add `threads.title TEXT`; threads CRUD adds `list_by_workspace(workspace_id)`; existing 1:1 callers continue to work (use `list_by_workspace().first()`).

### F3 — Candidate Solution view (v0.1)

- **allowed_files:**
  - `apps/desktop/src-tauri/src/commands/candidates.rs` (new)
  - SQL view `candidates_v` over `workspaces × workspace_changes` grouped by `task_id`
- **acceptance:** read-only Tauri command `list_candidates(task_id) -> Vec<Candidate>`; no schema migration.

### F4 — Merge Decision entity (v0.1)

- **allowed_files:** `migrations/00X_merge_decisions.sql`, `db/merge_decisions.rs`, `commands/merge.rs`
- **acceptance:** new table `merge_decisions(decision_id, task_id, winner_workspace_id, kind, rationale, decided_at)`; `kind ∈ {commit_only, merge_to_base, combine, archive_all, ask_revise}`; UI surfaces it in the right-panel "Merge" CTA.

### F5 — Multi-provider routing (v0.0.2 per D5/D12)

- **allowed_files:** `apps/desktop/src-tauri/src/llm/{mod.rs, claude_cli_adapter.rs, anthropic_api_adapter.rs, openrouter_adapter.rs}`
- **acceptance:** `trait LlmProvider` with one canonical `StreamEvent` shape; first impl is `claude_cli_adapter` (preserves Step 1.4 behavior); future impls slot in without touching `claude_cli/` callers.

### F6 — Coordination intelligence layer (v0.3+)

Vision-level. No file boundaries yet. Captured for the long-term roadmap; do not size until v0.1 ships.

---

## 8. Updated parallelization & merge strategy

Lane A is sequential (single critical path). Steps 1.4 / 1.5 / 1.6 are *internally* parallelizable but the next-atom-only `/implement` discipline keeps them sequential in practice. Lane B / C / D (Phase 2) remain unchanged; they can spin up after Step 1.6 lands the Tauri command surface.

```
Step 1.4 ─┬─ Atom 1.4.1 ──┐
          ├─ Atom 1.4.2 ──┤  (parallelizable)
          └─ Atom 1.4.3 ──┴── Atom 1.4.4 (gate)
Step 1.5 ─── Atom 1.5.1 ── Atom 1.5.2 ── Atom 1.5.3
Step 1.6 ─── Atom 1.6.1 ── Atom 1.6.2 ── Atom 1.6.3 ── Atom 1.6.4
Step 1.7 ─── Atom 1.7.1 ── Atom 1.7.2 ── Atom 1.7.3
```

Step 1.5 atoms can interleave with Step 1.4 atoms because S1.4.3 needs S1.5.1; otherwise no conflict.

---

## 9. Test plan addendum

The canonical test plan is `docs/timothy-main-eng-review-test-plan-20260509-072442.md` (D23). For the atoms above, every CRUD/service module follows the precedent set by Step 1.3:

- In-memory DB tests (`init_db_memory()`).
- One round-trip happy path per public function.
- One error path per `AppError` variant the function can produce.
- For subprocess code (claude_cli, sandbox, worktree): unit-test the pure pieces (parsing, path math, args assembly) and `#[ignore]` the integration tests that need real `git`/`claude` binaries.
- Coverage diagram in `PLAN-v0.0.1.md` (lines 654-727) lists the path-level gaps; tick them off as atoms land. No regression rule applies (green-field).

---

## 10. Explicit next step (resume from here)

A new agent picking this up should:

1. Read **§0 (status)**, **§3 (canonical model)**, **§5 (anti-breaking-change rules)**, **§6 Step 1.4** of this file. Nothing else is required to begin.
2. Run `/discussion` against `docs/specs/plan-v0.0.1-2.md` § 6 Step 1.4 to clarify any ambiguity that's actually blocking.
3. Run `/plan` to produce `tmp/ready-plans/04-step-1-4-claude-cli.md`. Plan body should atomize **only** S1.4.1, S1.4.2, S1.4.3, S1.4.4 — exactly four atoms, mirroring the Step 1.3 cadence.
4. Run `/atomize` to emit four `[ ]` rows into `TASKS.md` under a `## Step 1.4 — claude_cli.rs` heading.
5. Run `/implement` for **the first atom only** (S1.4.1). Stop at the man-in-the-middle checkpoint between atoms; do not auto-chain.
6. After S1.4.4 closes, return here for Step 1.5. Do not jump steps.
7. **Before Step 1.7 wires Tauri commands**, apply doc atom **F0** (see §7) — lift the canonical vocabulary into CLAUDE.md + fix the AGENTS.md pointer. F0 is documentation-only; it should land as one commit (`docs(F0): canonical product vocabulary in CLAUDE.md + AGENTS.md`).

If any acceptance criterion above proves unworkable in code, do **not** silently widen scope — return to `/plan-eng-review` with a one-line problem statement and the failing acceptance line.

---

## 11. Completion summary

- **Audit:** 8 concept slots checked against Conductor; 6 already aligned, 2 needed clarification (Task layer + worktree location), 4 future schema items captured (F1–F4).
- **Risks:** 4 identified, 4 mitigated by D17–D23.
- **Canonical model:** locked into §3 of this doc + CLAUDE.md.
- **Atoms produced:** 14 across Steps 1.4 + 1.5 + 1.6 + 1.7 (Steps 1.8 + 1.9 + 1.10 deferred to their own ready-plan after 1.7), plus F0 doc atom.
- **Phase 2 coverage:** Steps 2.1, 2.2, 2.3, 2.4, 2.5 scoped at design-level (allowed files, dependencies, when-to-atomize) in §6.2 — not atomized yet, by intention.
- **Architectural foresight:** §6.5 maps F0–F6 future tasks back to the Lane A atoms that protect them, so headroom checks become part of every atom review.
- **Source code touched in this pass:** 0 (documentation-only). Root-level files (CLAUDE.md, AGENTS.md) parked behind F0 so the user signs off on those edits.
- **Future tasks parked:** F0–F6 with allowed files + acceptance criteria. F0 should be applied **before** Step 1.7.
- **Verdict:** Lane A may resume with confidence at Step 1.4. No code corrections required. Phase 2 ready-plans get written as Phase 1 closes.
