# Plan: Step 1.4 — `claude_cli` (subprocess + stream parser)

**Spec source:** `docs/specs/plan-v0.0.1-2.md` § 6 Step 1.4 + § 6.5.1 (F5 rewrite contract). Discussion outcome: `.context/context.md` (D1.4-A through D1.4-L, dated 2026-05-10).
**Author:** /plan
**Date:** 2026-05-10
**Confidence:** 8/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/src/lib.rs:1-3` declares `pub mod db;` and `pub mod error;` — **no `claude_cli` module exists yet** (greenfield).
- `apps/desktop/src-tauri/src/error.rs:11-25` defines `AppError { Db | Io | NotFound | Validation }`, with `From<rusqlite::Error>` and `From<std::io::Error>` impls; comment at `:24` reserves `AgentSpawn` for Step 1.4.
- `apps/desktop/src-tauri/migrations/001_init.sql:60` locks `agent_events.event_type` enum strings: `stream_token | tool_call | cli_output | status_update | error`.
- `apps/desktop/src-tauri/src/db/agent_events.rs:9-21` exposes `insert(conn, run_id, event_type, payload_json, ts) -> Result<i64, AppError>` — used by the parser task.
- `apps/desktop/src-tauri/src/db/agent_runs.rs:33-51` exposes `mark_ended(conn, run_id, status, ended_at, exit_code, error_message) -> Result<(), AppError>` — used by `spawn_run` on exit.
- `apps/desktop/src-tauri/src/db/models.rs:50-61` defines `AgentRun` (and `Workspace` at `:31-41`) — these are the inputs for `spawn_run`.
- `apps/desktop/src-tauri/Cargo.toml:24-45` already declares every dep this step needs: `tauri 2.11.1`, `tauri-specta 2.0.0-rc.21`, `specta`, `serde_json`, `tokio` with `process+rt-multi-thread+macros+io-util`, `tempfile` + `anyhow` in dev. **No `Cargo.toml` edits.**
- `apps/desktop/src-tauri/src/spikes/spike_c_claude_cli.rs:42-49` is the prior art for the `claude -p ... --output-format=stream-json --include-partial-messages` invocation. **Drops `--verbose`** for production (D1.4-C).
- `apps/desktop/src-tauri/build.rs` is a 3-line stub. **Step 1.4 does not touch `build.rs`** (Step 1.7 redoes specta wiring).
- No `apps/desktop/src-tauri/tests/` directory exists; `tests/fixtures/` is created fresh in S1.4.3.

## 2. Intent — what we're delivering

After Step 1.4 closes the desktop backend can spawn a `claude` CLI subprocess against a workspace's `worktree_path`, parse stdout into typed `StreamEvent`s (token-only granularity per D1.4-A), persist an `agent_events` row per parsed event, emit each event on a `tauri::ipc::Channel<StreamEvent>`, and update the `agent_runs` row on exit (status + `ended_at` + `exit_code` + `error_message`). The `StreamEvent` enum is the canonical shape future `LlmProvider` adapters must produce — Anthropic-CLI specifics never leak into the type. No Tauri command is registered yet (Step 1.7).

## 3. Non-goals

- **No Tauri command registration** — Step 1.7. `spawn_run` is a Rust-side function only.
- **No tool-call streaming JSON assembly** (`input_json_delta` state machine) — F5 work; v0.0.1 surfaces tool blocks as raw JSON inside `CliOutput { line }`.
- **No `ToolCall` / `StatusUpdate` emission from `parse_line`** — variants are *declared* (so `agent_events.event_type` strings round-trip and Angular bindings ship a stable type at Step 1.7) but never produced in v0.0.1. F5 rewrites `parse_line`.
- **No `--model` / `--max-turns` / `--thinking-budget` arg passing** — v0.0.2 composer model picker.
- **No `claude` binary path caching in `config` table** — v0.0.2 if measured to matter; v0.0.1 resolves PATH on each spawn.
- **No Windows mock-binary support for tests** — Step 1.10 manual QA. Mock binary is `#[cfg(unix)]`-gated.
- **No `tracing` crate** — `log::info!` via `tauri-plugin-log` is enough at v0.0.1.
- **No `--dangerously-skip-permissions` flag** — never passed; verified by an explicit assertion in tests.
- **Forward dependency narrowing (see §11 Q-A).** `spawn_run` does **not** call `sandbox::git_checkpoint` (S1.5.1) or `sandbox::capture_diff` (S1.5.2) in Step 1.4. The `agent_runs.checkpoint_sha` field is left at whatever the caller-provided `&AgentRun` carries (typically `None` in v0.0.1 wiring); no `workspace_changes` row is inserted from `spawn_run`. Step 1.5 atoms reach back into `runner.rs` to add those two callsites — one line before spawn (capture sha → write back via `agent_runs::update_checkpoint_sha`, a CRUD function S1.5.1 will add if it does not yet exist) and one block after exit (capture diff → INSERT `workspace_changes`).

## 4. Architecture decisions locked in this plan

All inherited from `.context/context.md` (D1.4-A through D1.4-L). Re-stated here so the implementing agent does not re-derive.

- **D1.4-A (token-only parser, Option B).** `parse_line` extracts assistant text only; every other JSON shape — including tool-use blocks, `message_*`, `content_block_start/stop`, `ping`, malformed JSON — is wrapped losslessly as `CliOutput { line }`. Empty/whitespace lines return `None`.
- **D1.4-B (F5 rewrite, not extend).** The B-era `CliOutput` corpus is the v0.0.2 migration test fixture; do not bake Anthropic specifics into `StreamEvent`. See § 6.5.1 of the spec.
- **D1.4-C (drop `--verbose`).** Production CLI invocation is `claude -p <prompt> --output-format=stream-json --include-partial-messages` — exactly three flags after the prompt.
- **D1.4-D (StreamEvent location).** `apps/desktop/src-tauri/src/claude_cli/mod.rs`. Moves to `llm/types.rs` at F5.
- **D1.4-E (cancel semantics).** `Child::kill()` + `kill_on_drop(true)`; caller marks `agent_runs.status='stopped'`.
- **D1.4-F (DB cadence).** One INSERT per parsed event. No batching in v0.0.1.
- **D1.4-G (stderr handling).** Each stderr line → `StreamEvent::Error { message }` → channel emit + `agent_events` INSERT (`event_type='error'`). Last stderr buffer → `agent_runs.error_message` if final status is `error`.
- **D1.4-H (CLI binary path).** `Command::new("claude")` per spawn — uses PATH each time. No caching.
- **D1.4-I (min CLI version 2.0.0, soft).** Version check warns at startup; does not refuse to run.
- **D1.4-J (AgentRun row creation).** Caller responsibility (Step 1.7). `spawn_run` takes `&AgentRun` already inserted with status `running`.
- **D1.4-K (mock binary).** Shell script at `apps/desktop/src-tauri/tests/fixtures/mock-claude.sh`; `#[cfg(unix)]`-gated; Windows deferred to Step 1.10 manual QA.
- **D1.4-L (tool-result correlation).** Deferred to F5.
- **`parse_line` API (re-confirmed).** `fn parse_line(line: &str) -> Option<StreamEvent>` — `None` for empty/whitespace, `Some(...)` otherwise; no `Result`.
- **`spawn_run` signature (re-confirmed).** Four explicit args (`workspace`, `run`, `channel`, `db`), no `RunRequest` struct wrapper. Premature abstraction; F5 reshapes anyway.
- **Channel backpressure.** `tauri::ipc::Channel<StreamEvent>` is unbounded by design; v0.0.1 mitigation is run-lifetime-bound (`kill_on_drop(true)` + `RunHandle` drop kills the process). Documented as known v0.0.1 risk; revisited at Step 1.8 if UI navigation away mid-stream surfaces a memory issue.
- **`AppError` extension.** Adds one variant `AgentSpawn(String)` for binary-not-found / invocation failures (the comment at `error.rs:24` already reserves the slot). All other failure surfaces map to existing `Io` / `Db` / `Validation`.

## 5. Files

### To create
- `apps/desktop/src-tauri/src/claude_cli/mod.rs` — module root; declares `pub mod parser; pub mod install; pub mod runner;` and re-exports `StreamEvent` + the public `RunHandle` type.
- `apps/desktop/src-tauri/src/claude_cli/parser.rs` — `parse_line(line: &str) -> Option<StreamEvent>`.
- `apps/desktop/src-tauri/src/claude_cli/install.rs` — `pub enum ClaudeInstall { Installed { version: String } | Missing }` + `pub async fn check_installed() -> ClaudeInstall`.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs` — `pub async fn spawn_run(...)` + `pub struct RunHandle`.
- `apps/desktop/src-tauri/tests/fixtures/streams/happy-text.jsonl` — canned successful text reply.
- `apps/desktop/src-tauri/tests/fixtures/streams/with-tool-use.jsonl` — text + tool_use mid-stream (asserts B falls back to `CliOutput`).
- `apps/desktop/src-tauri/tests/fixtures/streams/stderr-then-exit.sh` — bash one-liner that writes 1 line to stderr and exits non-zero.
- `apps/desktop/src-tauri/tests/fixtures/mock-claude.sh` — `#!/bin/sh`; routes by first arg (`--version` → prints `2.1.138`; `-p` → cats one of the JSONL fixtures from the env var `MOCK_CLAUDE_FIXTURE`; default → exits 1).

### To modify
- `apps/desktop/src-tauri/src/lib.rs` — add `pub mod claude_cli;` (single line, no Builder wiring).
- `apps/desktop/src-tauri/src/error.rs` — add `AgentSpawn(String)` variant (with `#[error("agent spawn failed: {0}")]`).

### Reference (read-only — model the new code on these)
- `apps/desktop/src-tauri/src/spikes/spike_c_claude_cli.rs:42-78` — exact CLI invocation + line-loop pattern (drop `--verbose`).
- `apps/desktop/src-tauri/src/db/agent_events.rs:9-21` — INSERT call shape used by parser task.
- `apps/desktop/src-tauri/src/db/agent_runs.rs:33-51` — `mark_ended` call shape used at exit.
- `apps/desktop/src-tauri/src/db/models.rs:31-61` — `Workspace` and `AgentRun` row structs.
- `apps/desktop/src-tauri/migrations/001_init.sql:60` — `agent_events.event_type` enum source of truth.

## 6. Pseudocode (per non-trivial unit)

### `claude_cli/mod.rs`

```rust
use serde::{Deserialize, Serialize};

pub mod install;
pub mod parser;
pub mod runner;

pub use runner::{spawn_run, RunHandle};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    StreamToken  { text: String },
    ToolCall     { name: String, args_json: String },     // declared, NOT emitted in v0.0.1
    CliOutput    { line: String },
    StatusUpdate { status: String },                       // declared, NOT emitted in v0.0.1
    Error        { message: String },
}

impl StreamEvent {
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::StreamToken  { .. } => "stream_token",
            Self::ToolCall     { .. } => "tool_call",
            Self::CliOutput    { .. } => "cli_output",
            Self::StatusUpdate { .. } => "status_update",
            Self::Error        { .. } => "error",
        }
    }
}
```

### `claude_cli/parser.rs`

```rust
use serde_json::Value;
use crate::claude_cli::StreamEvent;

pub fn parse_line(line: &str) -> Option<StreamEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() { return None; }

    // Lossless fallback: any decode failure → CliOutput { line }
    let v: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Some(StreamEvent::CliOutput { line: line.to_string() }),
    };

    let is_text_delta = v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta")
        && v.get("delta").and_then(|d| d.get("type")).and_then(|t| t.as_str()) == Some("text_delta");

    if is_text_delta {
        if let Some(text) = v.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()) {
            return Some(StreamEvent::StreamToken { text: text.to_string() });
        }
    }
    Some(StreamEvent::CliOutput { line: line.to_string() })
}
```

### `claude_cli/install.rs`

```rust
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub enum ClaudeInstall { Installed { version: String }, Missing }

pub async fn check_installed() -> ClaudeInstall {
    let fut = Command::new("claude").arg("--version").output();
    let out = match timeout(Duration::from_secs(3), fut).await {
        Ok(Ok(o)) if o.status.success() => o,
        _ => return ClaudeInstall::Missing,
    };
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    // Best-effort: trust whatever non-empty token comes back. Don't surface OS-level errors.
    if stdout.is_empty() { ClaudeInstall::Missing }
    else { ClaudeInstall::Installed { version: stdout } }
}
```

### `claude_cli/runner.rs`

```rust
use tauri::ipc::Channel;
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use std::sync::Arc;

use crate::claude_cli::{parser::parse_line, StreamEvent};
use crate::db::{agent_events, agent_runs, now_ms, DbState};
use crate::db::models::{AgentRun, Workspace};
use crate::error::AppError;

pub struct RunHandle {
    run_id: String,
    child: Arc<tokio::sync::Mutex<Option<Child>>>,
    // join handle for the parser task lives here too
}

impl RunHandle {
    pub async fn cancel(&self) -> Result<(), AppError> {
        if let Some(mut c) = self.child.lock().await.take() {
            let _ = c.start_kill();   // SIGKILL on Unix per tokio; kill_on_drop covers child cleanup if cancel races drop
        }
        Ok(())
    }
}

pub async fn spawn_run(
    workspace: &Workspace,
    run: &AgentRun,
    channel: Channel<StreamEvent>,
    db: &DbState,
) -> Result<RunHandle, AppError> {
    // 1) Spawn claude with the locked flag set (NO --verbose, NO --dangerously-skip-permissions).
    let mut child = Command::new("claude")
        .args([
            "-p", &run.prompt,
            "--output-format=stream-json",
            "--include-partial-messages",
        ])
        .current_dir(&workspace.worktree_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::AgentSpawn(format!("spawn claude: {e}")))?;

    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");

    // 2) Spawn one task to drain stdout → parse_line → channel + agent_events INSERT (D1.4-F).
    //    Spawn one task to drain stderr → StreamEvent::Error → channel + INSERT (D1.4-G);
    //    keep the last stderr line in a shared buffer for the exit branch.
    //    On exit: call agent_runs::mark_ended with final status / exit_code / last stderr.

    // (full body in implementation)

    Ok(RunHandle { run_id: run.run_id.clone(), child: Arc::new(tokio::sync::Mutex::new(Some(child))) })
}
```

## 7. Error handling strategy

- New `AppError::AgentSpawn(String)` covers binary-not-found + spawn-error (`io::ErrorKind::NotFound` → `AgentSpawn`, not `Io`, so the UI can show "install Claude" instead of "I/O error").
- Stdout decode failures → `StreamEvent::CliOutput { line }`. Lossless. Never panic, never `Err`.
- Stderr lines → `StreamEvent::Error { message }` + `agent_events` row with `event_type='error'`.
- `agent_events::insert` returning `Err` (e.g., FK violation if the run row was deleted mid-stream) → log via `log::warn!` and continue draining; do NOT abort the parser task. The user-visible stream is on the channel; the DB row is best-effort persistence.
- Exit cases: `status.success()` → `agent_runs::mark_ended(status="done", exit_code=Some(0))`. Non-zero → `mark_ended(status="error", exit_code=…, error_message=Some(last_stderr))`. `cancel()` was called → `mark_ended(status="stopped", exit_code=…, error_message=None)`. Process killed by signal → `status="crashed"`.
- Channel send failures (UI gone) → ignore. The DB row is the durable record.

## 8. Task list (will be atomized into `TASKS.md`)

Four atoms — same cadence as Step 1.3. Numbering matches the spec verbatim.

1. **S1.4.1 — `StreamEvent` enum + `parse_line`** (parallelizable with S1.4.2).
   - allowed: `claude_cli/mod.rs`, `claude_cli/parser.rs`, `lib.rs` (add module decl), `error.rs` (add `AgentSpawn` variant).
   - tests (≥6): text_delta → `Some(StreamToken)`; tool_use `content_block_start` → `Some(CliOutput)`; `message_start`/`content_block_stop`/`message_stop` → `Some(CliOutput)`; JSON-invalid → `Some(CliOutput)`; empty → `None`; `event_type()` round-trip for all 5 variants; serde tag round-trip asserts wire shape `{"kind":"stream_token","text":"..."}`.
2. **S1.4.2 — `claude_cli::install::check_installed`** (parallelizable with S1.4.1).
   - allowed: `claude_cli/install.rs` only.
   - tests (≥3): version-string parsing branch (fed via a fake `Command` shim — the simplest form is to factor the parsing of a captured stdout `&str` into a small helper that *is* unit-testable; the spawn branch stays integration-only and `#[ignore]`-gated). Missing-binary returns `Missing`. Timeout branch returns `Missing` (use a fixture script that sleeps > 3s; `#[cfg(unix)]`).
3. **S1.4.3 — `claude_cli::runner::spawn_run`** (depends: S1.4.1, S1.4.2; **forward-depends: S1.5.1 `sandbox::git_checkpoint` + S1.5.2 `sandbox::capture_diff` — see §11**).
   - allowed: `claude_cli/runner.rs`, `apps/desktop/src-tauri/tests/fixtures/**` (mock binary + JSONL + stderr fixture).
   - tests (4 — all `#[cfg(unix)]`, all integration via the mock binary):
     - **happy path** — `mock-claude.sh` cats `happy-text.jsonl`; assert ≥ 1 `StreamToken` arrives on the channel; assert ≥ 1 `agent_events` row with `event_type='stream_token'`; assert `agent_runs.status='done'`, `exit_code=0`.
     - **tool-use mid-stream falls back to CliOutput** — `with-tool-use.jsonl`; assert tool_use lines round-trip as `CliOutput` (B-shape; the F5 corpus contract).
     - **cancel mid-stream** — start with a slow fixture (`sleep 10`), call `RunHandle::cancel()`; assert `agent_runs.status='stopped'`.
     - **non-zero exit + stderr captured** — `stderr-then-exit.sh`; assert `agent_runs.status='error'`, `error_message` = last stderr line, ≥ 1 `agent_events` row with `event_type='error'`.
   - Cross-cutting assertion (every test): the spawned `Command` argv contains `--output-format=stream-json` AND `--include-partial-messages`, AND does **not** contain `--verbose`, AND does **not** contain `--dangerously-skip-permissions`. Implement via a thin `command_argv_for_test()` helper in `runner.rs` that returns the constructed `Vec<String>` so tests can introspect without executing.
4. **S1.4.4 — Step 1.4 final gate** (depends: S1.4.1, S1.4.2, S1.4.3).
   - acceptance: `cargo test --tests` green (existing 34+ tests + the new ones); `cargo clippy --all-targets -- -D warnings` clean; no files touched outside `claude_cli/**`, `lib.rs`, `error.rs`, `tests/fixtures/**`; `grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"` zero hits outside `docs/competitors/`; `grep -rn "worktree_path\|branch_name\|agent/wip-" apps/desktop/src-tauri/src/claude_cli/` is allowed (internal — these are not user-visible strings).

## 9. Validation gate

```sh
# Rust core
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && cargo test --tests
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings

# Typecheck still intact
pnpm nx run-many -t typecheck

# Naming Lock — must be 0 hits outside docs/competitors/
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts" 2>/dev/null

# Step-1.4-specific: assert the canonical event_type strings agree across boundaries
grep -E '"(stream_token|tool_call|cli_output|status_update|error)"' \
  apps/desktop/src-tauri/migrations/001_init.sql \
  apps/desktop/src-tauri/src/claude_cli/mod.rs

# Argv assertion (cross-cutting from S1.4.3): production invocation must carry the locked flag set
# and must NEVER carry --verbose or --dangerously-skip-permissions. Asserted in unit tests via
# command_argv_for_test(); also greppable as a cheap belt-and-braces check:
! grep -n -- "--verbose" apps/desktop/src-tauri/src/claude_cli/runner.rs
! grep -n -- "--dangerously-skip-permissions" apps/desktop/src-tauri/src/claude_cli/runner.rs
grep -n -- "--output-format=stream-json" apps/desktop/src-tauri/src/claude_cli/runner.rs
grep -n -- "--include-partial-messages" apps/desktop/src-tauri/src/claude_cli/runner.rs
```

Spike tests (`#[ignore]`) are explicitly **not** part of this gate — they need a real `claude` binary + auth.

## 10. Rollback

- All changes are additive. `git revert` of the four atom commits restores the pre-Step-1.4 tree.
- `error.rs` adds one variant. Reverting the `AgentSpawn` variant is safe — no existing caller uses it.
- No schema migration; no generated bindings (Step 1.7 owns specta export). Reverting `claude_cli/**` removes everything cleanly.
- `lib.rs` change is one line (`pub mod claude_cli;`) — trivially reversible.

## 11. Open questions

(none — see "Resolved during /plan" below for the one judgment call.)

### Resolved during /plan

**Q-A. Does S1.4.3 land before or after S1.5.1 (`sandbox::git_checkpoint`)?**
Resolved: S1.4.3 ships **without** the checkpoint and diff calls. The `spawn_run` body lays down the streaming pipe + run-status update; Step 1.5 atoms reach back to add (a) `sandbox::git_checkpoint(...)?` before spawn (writing the sha onto the run row via a small `agent_runs::update_checkpoint_sha` CRUD addition that S1.5.1 brings) and (b) `sandbox::capture_diff(...)?` after exit (INSERTing into `workspace_changes`). Trade-off: the S1.4.3 acceptance lines at `docs/specs/plan-v0.0.1-2.md:234-238` mention both calls inside Step 1.4. This plan **narrows that** — forcing S1.4.3 to depend on S1.5.1 + S1.5.2 forms a 3-atom chain that a single PR cannot validate end-to-end without a real git binary, breaking the "one-PR-one-green-test-suite" cadence Step 1.3 set. The spec's Lane A parallelization diagram (§ 8) explicitly anticipates the S1.4.3 ↔ S1.5.x interleave. Reach-back edits are one-line per call; the Step 1.5 ready-plan must list them in its §5 "To modify" block so they are not forgotten.

## 12. Confidence

**8/10** — Decisions are fully locked from the discussion; the only judgment call is the Q-A scope-narrowing for S1.4.3 (deferring the sandbox callsites to Step 1.5 atoms). That call is reversible: if the implementing agent or reviewer prefers the spec-literal three-atom chain, they can rewrite S1.4.3 to wait for S1.5.1 + S1.5.2 — at the cost of breaking the "one-PR-one-green-test-suite" cadence Step 1.3 set. Confidence drops below 9 only because no Step-1.4 code exists in-tree yet; the plan-vs-implementation reality check happens at the first `cargo check`.
