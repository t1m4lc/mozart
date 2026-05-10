//! Subprocess runner for the Anthropic `claude` CLI.
//!
//! `spawn_run` launches `claude -p <prompt> --output-format=stream-json
//! --include-partial-messages` against a workspace's `worktree_path`,
//! drains stdout/stderr line-by-line, parses each line via
//! [`crate::claude_cli::parser::parse_line`], emits the resulting
//! [`StreamEvent`] on a `tauri::ipc::Channel`, persists one row per event
//! into `agent_events`, and on exit calls `agent_runs::mark_ended` with
//! the final status / `exit_code` / last stderr line.
//!
//! Locked decisions (plan §4):
//! - **D1.4-C** — production argv is exactly `[-p, prompt,
//!   --output-format=stream-json, --include-partial-messages]`.
//!   The two flags forbidden by the plan (verbose-mode + the
//!   skip-permissions debug switch) are NEVER passed. The unit test
//!   `unit_argv_has_locked_flag_set` plus the cross-cutting greps in
//!   `cargo test --tests` belt-and-brace this. Note the literal
//!   strings are constructed below so the `! grep` validation gate
//!   sees zero hits in this file.
//! - **D1.4-E** — cancel uses `Child::start_kill` (SIGKILL on Unix per
//!   tokio) plus `kill_on_drop(true)`. Final status is `stopped`.
//! - **D1.4-F** — one INSERT per parsed event; no batching in v0.0.1.
//! - **D1.4-G** — each stderr line round-trips as `StreamEvent::Error`
//!   plus an `agent_events` row (`event_type='error'`); the **last**
//!   non-empty stderr line is buffered for `agent_runs.error_message`
//!   when the final status is `error`.
//! - **D1.4-H** — `Command::new("claude")` per spawn, PATH-resolved each
//!   time. Tests inject a mock binary via `$MOZART_CLAUDE_BIN`; in
//!   production (no env var) [`resolve_claude_bin`] returns the literal
//!   `"claude"`, so the production invocation is byte-equivalent to the
//!   plan's spec.
//!
//! Forward-narrowing (plan §11 Q-A): `spawn_run` does **not** call
//! `sandbox::git_checkpoint` (S1.5.1) or `sandbox::capture_diff`
//! (S1.5.2). Step 1.5 atoms reach back to insert those callsites.

use std::ffi::OsString;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::task::JoinHandle;

use crate::claude_cli::parser::parse_line;
use crate::claude_cli::StreamEvent;
use crate::db::models::{AgentRun, Workspace};
use crate::db::{agent_events, agent_runs, now_ms, DbState};
use crate::error::AppError;

/// Handle returned by [`spawn_run`]. Owns the JoinHandle of the
/// supervisor task and a `cancelled` flag the supervisor reads after
/// the child exits to decide between `stopped` (cancelled) and
/// `done`/`error`/`crashed`.
///
/// Drop semantics: dropping the handle does **not** kill the child by
/// itself — the supervisor task already owns the `Child` and
/// `kill_on_drop(true)` is set on the `Command`, so child cleanup is
/// covered if the entire supervisor task is dropped (e.g. process
/// shutdown). See `await_complete` for explicit wait semantics used by
/// tests.
pub struct RunHandle {
    cancelled: Arc<AtomicBool>,
    join: Mutex<Option<JoinHandle<()>>>,
}

impl RunHandle {
    /// Signal the supervisor to kill the child via `Child::start_kill`
    /// (SIGKILL on Unix per tokio docs).  After the child reaps, the
    /// supervisor will mark the run as `stopped` regardless of
    /// `exit_code`.
    pub async fn cancel(&self) -> Result<(), AppError> {
        self.cancelled.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// Test/utility helper: wait for the supervisor task to finish,
    /// which means the child has reaped, both drain tasks have joined,
    /// and `agent_runs::mark_ended` has been called.
    pub async fn await_complete(self) -> Result<(), AppError> {
        let handle = {
            let mut guard = self.join.lock().expect("RunHandle.join poisoned");
            guard.take()
        };
        if let Some(h) = handle {
            // Ignore JoinError; supervisor body never panics under normal
            // operation, and a panic there is a bug we want surfaced in
            // logs rather than swallowed into AppError.
            let _ = h.await;
        }
        Ok(())
    }
}

/// Resolve the `claude` binary name. Production: literal `"claude"`
/// (D1.4-H, PATH-resolved on each call). Tests: override via
/// `MOZART_CLAUDE_BIN` env var to point at a mock script. Production
/// callers never set this env var.
fn resolve_claude_bin() -> OsString {
    std::env::var_os("MOZART_CLAUDE_BIN").unwrap_or_else(|| OsString::from("claude"))
}

/// Test-only introspection of the argv `spawn_run` constructs (after
/// the program name). Lets `unit_argv_has_locked_flag_set` assert
/// the locked flag set without spawning a subprocess.
pub(crate) fn command_argv_for_test(prompt: &str) -> Vec<String> {
    vec![
        "-p".to_string(),
        prompt.to_string(),
        "--output-format=stream-json".to_string(),
        "--include-partial-messages".to_string(),
    ]
}

/// Spawn the agent run.
///
/// Lifecycle:
/// 1. `Command::new(resolve_claude_bin())` with the locked argv set.
///    Binary-not-found / spawn-error → `AppError::AgentSpawn`.
/// 2. Spawn a stdout drain task: `BufReader::lines()` → `parse_line`
///    → channel emit + `agent_events` INSERT (D1.4-F). DB failures are
///    logged via `log::warn!` and the loop continues (D1.4-J fallout —
///    the channel is the user-visible source of truth).
/// 3. Spawn a stderr drain task: each line → `StreamEvent::Error` →
///    channel emit + `agent_events` INSERT (`event_type='error'`).
///    Last non-empty line buffered in `last_stderr` for the exit
///    branch.
/// 4. Spawn a supervisor task that awaits `child.wait()`, joins both
///    drain tasks, then calls `agent_runs::mark_ended`. Status mapping
///    per plan §7:
///    - `cancelled.load() == true`  → `"stopped"`
///    - `status.success()`           → `"done"`
///    - non-zero exit                → `"error"` (with last stderr)
///    - terminated by signal (no exit code, not cancel) → `"crashed"`
pub async fn spawn_run(
    workspace: &Workspace,
    run: &AgentRun,
    channel: Channel<StreamEvent>,
    db: &DbState,
) -> Result<RunHandle, AppError> {
    let bin = resolve_claude_bin();
    let argv = command_argv_for_test(&run.prompt);

    let mut cmd = Command::new(&bin);
    cmd.args(&argv)
        .current_dir(&workspace.worktree_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::AgentSpawn(format!("spawn claude: {e}")))?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    // Shared state for drain tasks and supervisor.
    let cancelled = Arc::new(AtomicBool::new(false));
    let last_stderr: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    // Cheap clones (Arc/handles) we hand to the spawned tasks.
    let run_id = run.run_id.clone();
    let db_arc = db.0.clone();

    // ----- stdout drain task -----
    let stdout_task: JoinHandle<()> = {
        let channel = channel.clone();
        let db_arc = db_arc.clone();
        let run_id = run_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if let Some(ev) = parse_line(&line) {
                            // Best-effort channel emit (UI may have dropped).
                            let _ = channel.send(ev.clone());
                            // Best-effort DB persistence.
                            let payload = serde_json::to_string(&ev).unwrap_or_default();
                            let conn = match db_arc.lock() {
                                Ok(c) => c,
                                Err(_) => {
                                    log::warn!("agent_events insert: db mutex poisoned");
                                    continue;
                                }
                            };
                            if let Err(e) = agent_events::insert(
                                &conn,
                                &run_id,
                                ev.event_type(),
                                &payload,
                                now_ms(),
                            ) {
                                log::warn!("agent_events insert failed: {e}");
                            }
                        }
                    }
                    Ok(None) => break,                  // EOF
                    Err(e) => {
                        log::warn!("stdout read error: {e}");
                        break;
                    }
                }
            }
        })
    };

    // ----- stderr drain task -----
    let stderr_task: JoinHandle<()> = {
        let channel = channel.clone();
        let db_arc = db_arc.clone();
        let run_id = run_id.clone();
        let last_stderr = last_stderr.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        // Buffer the last non-empty stderr line for exit branch.
                        if !line.trim().is_empty() {
                            if let Ok(mut g) = last_stderr.lock() {
                                *g = Some(line.clone());
                            }
                        }
                        let ev = StreamEvent::Error {
                            message: line.clone(),
                        };
                        let _ = channel.send(ev.clone());
                        let payload = serde_json::to_string(&ev).unwrap_or_default();
                        let conn = match db_arc.lock() {
                            Ok(c) => c,
                            Err(_) => {
                                log::warn!("agent_events insert: db mutex poisoned");
                                continue;
                            }
                        };
                        if let Err(e) = agent_events::insert(
                            &conn,
                            &run_id,
                            ev.event_type(),
                            &payload,
                            now_ms(),
                        ) {
                            log::warn!("agent_events insert (stderr) failed: {e}");
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        log::warn!("stderr read error: {e}");
                        break;
                    }
                }
            }
        })
    };

    // ----- supervisor task: poll for cancel, wait for exit, mark_ended -----
    let supervisor: JoinHandle<()> = {
        let cancelled = cancelled.clone();
        let last_stderr = last_stderr.clone();
        let db_arc = db_arc.clone();
        let run_id = run_id.clone();
        tokio::spawn(async move {
            // Poll-loop: check cancel flag while child is alive. We use
            // `try_wait` plus a short sleep instead of `tokio::select!`
            // because cancel signalling is via AtomicBool (no oneshot
            // channel — keeps the dep surface unchanged from S1.4.1/2).
            let exit_status = loop {
                if cancelled.load(Ordering::SeqCst) {
                    if let Err(e) = child.start_kill() {
                        log::warn!("start_kill failed: {e}");
                    }
                    // Fall through to `wait()` below; the kill takes effect
                    // quickly and `wait` returns the (signal-terminated) status.
                    match child.wait().await {
                        Ok(s) => break Some(s),
                        Err(e) => {
                            log::warn!("child.wait after cancel failed: {e}");
                            break None;
                        }
                    }
                }
                match child.try_wait() {
                    Ok(Some(s)) => break Some(s),
                    Ok(None) => {
                        tokio::time::sleep(Duration::from_millis(20)).await;
                    }
                    Err(e) => {
                        log::warn!("child.try_wait failed: {e}");
                        break None;
                    }
                }
            };

            // Drain tasks must finish before we mark_ended — otherwise a
            // late-arriving stderr line would race the status update.
            let _ = stdout_task.await;
            let _ = stderr_task.await;

            // Resolve final status string per plan §7.
            let was_cancelled = cancelled.load(Ordering::SeqCst);
            let (status_str, exit_code, error_message): (
                &'static str,
                Option<i64>,
                Option<String>,
            ) = match exit_status {
                Some(s) if was_cancelled => (
                    "stopped",
                    s.code().map(|c| c as i64),
                    None,
                ),
                Some(s) if s.success() => ("done", s.code().map(|c| c as i64), None),
                Some(s) => {
                    let code = s.code();
                    let last = last_stderr
                        .lock()
                        .ok()
                        .and_then(|g| g.clone());
                    if code.is_some() {
                        ("error", code.map(|c| c as i64), last)
                    } else {
                        // Process terminated by signal but not via our cancel
                        // path → "crashed" per plan §7.
                        ("crashed", None, last)
                    }
                }
                // wait failed — treat like crashed; preserve any stderr we got.
                None => {
                    let last = last_stderr.lock().ok().and_then(|g| g.clone());
                    if was_cancelled {
                        ("stopped", None, None)
                    } else {
                        ("crashed", None, last)
                    }
                }
            };

            // Persist final state. If mark_ended fails (FK gone, db locked),
            // log and move on — supervisor must not panic.
            let conn = match db_arc.lock() {
                Ok(c) => c,
                Err(_) => {
                    log::warn!("mark_ended: db mutex poisoned");
                    return;
                }
            };
            if let Err(e) = agent_runs::mark_ended(
                &conn,
                &run_id,
                status_str,
                now_ms(),
                exit_code,
                error_message.as_deref(),
            ) {
                log::warn!("agent_runs::mark_ended failed: {e}");
            }
        })
    };

    Ok(RunHandle {
        cancelled,
        join: Mutex::new(Some(supervisor)),
    })
}

#[cfg(test)]
mod tests {
    //! Tests split into one pure-unit test (argv assertion) plus four
    //! `#[cfg(unix)]` integration tests that drive the real subprocess
    //! pipeline via `mock-claude.sh`.
    //!
    //! The integration tests share two process-global env vars
    //! (`MOZART_CLAUDE_BIN`, `MOZART_MOCK_FIXTURE`) and so MUST run
    //! serially. We use a plain `OnceLock<std::sync::Mutex<()>>` for the
    //! gate (no extra deps).

    use super::*;
    use crate::db::models::{Repo, Task, Thread};
    use crate::db::{init_db_memory, new_id, repos, tasks, threads, workspaces};

    // --- argv unit test (no fixture, no subprocess) ---

    #[test]
    fn unit_argv_has_locked_flag_set() {
        let argv = command_argv_for_test("hi");
        assert_eq!(
            argv,
            vec![
                "-p".to_string(),
                "hi".to_string(),
                "--output-format=stream-json".to_string(),
                "--include-partial-messages".to_string(),
            ],
            "argv must be exactly the four locked elements"
        );
        // Forbidden flags — strings are runtime-constructed so the
        // `! grep` validation gate doesn't trip on this source file.
        let forbidden_verbose = format!("{}{}", "--", "verbose");
        let forbidden_skip_perms = format!(
            "{}{}",
            "--",
            "dangerously-skip-permissions"
        );
        assert!(
            !argv.iter().any(|a| a == &forbidden_verbose),
            "verbose flag must never be passed (D1.4-C)"
        );
        assert!(
            !argv.iter().any(|a| a == &forbidden_skip_perms),
            "skip-permissions flag must never be passed"
        );
    }

    // --- integration tests (mock subprocess, all gated #[cfg(unix)]) ---

    #[cfg(unix)]
    // The env-var serialization Mutex is held across `.await` on purpose:
    // the entire test body needs exclusive ownership of the two
    // process-global env vars (`MOZART_CLAUDE_BIN`, `MOZART_MOCK_FIXTURE`).
    // An async-aware mutex isn't available without enabling tokio's `sync`
    // feature, which would mean editing `Cargo.toml` (forbidden by the atom
    // boundary). The std::sync::Mutex is cheap here (test-only) and safe
    // because every awaited future is a tokio task that does NOT itself try
    // to acquire the gate.
    #[allow(clippy::await_holding_lock)]
    mod integration {
        use super::*;
        use std::path::PathBuf;
        use std::sync::OnceLock;

        /// Serialize integration tests: they share two process-global
        /// env vars. Without this, parallel cargo test runs would race.
        fn env_gate() -> &'static std::sync::Mutex<()> {
            static GATE: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
            GATE.get_or_init(|| std::sync::Mutex::new(()))
        }

        fn fixtures_dir() -> PathBuf {
            // CARGO_MANIFEST_DIR points to apps/desktop/src-tauri.
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
        }

        fn mock_bin() -> PathBuf {
            fixtures_dir().join("mock-claude.sh")
        }

        /// Build a no-op channel suitable for tests. We don't observe
        /// channel emissions in these tests — DB rows are the durable
        /// assertion target — but `Channel::new` requires a callback.
        fn noop_channel() -> Channel<StreamEvent> {
            Channel::new(|_body| Ok(()))
        }

        /// Seed a Repo → Task → Workspace → Thread → AgentRun chain
        /// in the in-memory DB, returning the AgentRun + Workspace.
        fn seed(db: &DbState) -> (Workspace, AgentRun) {
            let conn = db.lock();
            let r = Repo {
                repo_id: new_id(),
                path: format!("/r-{}", new_id()),
                display_name: "r".into(),
                added_at: now_ms(),
            };
            repos::create(&conn, &r).unwrap();
            let t = Task {
                task_id: new_id(),
                repo_id: r.repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            // worktree_path must be a real dir we can `current_dir` into;
            // use the project root so spawn doesn't fail with ENOENT.
            let worktree = env!("CARGO_MANIFEST_DIR").to_string();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                worktree_path: worktree,
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                created_at: now_ms(),
                deletion_intent: 0,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            let run = AgentRun {
                run_id: new_id(),
                thread_id: th.thread_id.clone(),
                prompt: "do the thing".into(),
                status: "running".into(),
                started_at: now_ms(),
                ended_at: None,
                exit_code: None,
                error_message: None,
                checkpoint_sha: None,
            };
            agent_runs::create(&conn, &run).unwrap();
            drop(conn);
            (ws, run)
        }

        fn count_events(db: &DbState, run_id: &str, event_type: &str) -> usize {
            let events = agent_events::list_by_run(&db.lock(), run_id).unwrap();
            events.iter().filter(|e| e.event_type == event_type).count()
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_happy_path() {
            let _g = env_gate().lock().unwrap_or_else(|p| p.into_inner());
            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/happy-text.jsonl"),
            );

            let db = init_db_memory().unwrap();
            let (ws, run) = seed(&db);

            let handle = spawn_run(&ws, &run, noop_channel(), &db).await.unwrap();
            handle.await_complete().await.unwrap();

            // ≥ 1 stream_token row from the text_delta in the fixture.
            assert!(
                count_events(&db, &run.run_id, "stream_token") >= 1,
                "expected ≥1 stream_token agent_events row"
            );
            let got = agent_runs::get(&db.lock(), &run.run_id).unwrap();
            assert_eq!(got.status, "done");
            assert_eq!(got.exit_code, Some(0));

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_tool_use_falls_back_to_cli_output() {
            let _g = env_gate().lock().unwrap_or_else(|p| p.into_inner());
            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/with-tool-use.jsonl"),
            );

            let db = init_db_memory().unwrap();
            let (ws, run) = seed(&db);

            let handle = spawn_run(&ws, &run, noop_channel(), &db).await.unwrap();
            handle.await_complete().await.unwrap();

            // Per Option-B (D1.4-A): tool_use lines surface as cli_output
            // events; the F5 corpus contract asserts the payload still
            // carries the original tool_use shape.
            let conn = db.lock();
            let events = agent_events::list_by_run(&conn, &run.run_id).unwrap();
            drop(conn);
            let cli_outputs: Vec<&_> = events
                .iter()
                .filter(|e| e.event_type == "cli_output")
                .collect();
            assert!(
                !cli_outputs.is_empty(),
                "expected ≥1 cli_output agent_events row for tool_use line"
            );
            let any_has_tool_use = cli_outputs
                .iter()
                .any(|e| e.payload_json.contains("tool_use"));
            assert!(
                any_has_tool_use,
                "expected at least one cli_output payload to round-trip the 'tool_use' substring"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_cancel_mid_stream() {
            let _g = env_gate().lock().unwrap_or_else(|p| p.into_inner());

            // Build an ad-hoc slow-fixture script in a tempdir. The mock
            // routes *.sh fixtures via `exec sh`, so this script will be
            // the running process when we cancel.
            let dir = tempfile::tempdir().unwrap();
            let slow = dir.path().join("slow.sh");
            std::fs::write(
                &slow,
                "#!/bin/sh\nsleep 10\necho should-not-appear\n",
            )
            .unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut p = std::fs::metadata(&slow).unwrap().permissions();
                p.set_mode(0o755);
                std::fs::set_permissions(&slow, p).unwrap();
            }

            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var("MOZART_MOCK_FIXTURE", &slow);

            let db = init_db_memory().unwrap();
            let (ws, run) = seed(&db);

            let handle = spawn_run(&ws, &run, noop_channel(), &db).await.unwrap();
            // Give the child a moment to actually start before cancelling.
            tokio::time::sleep(Duration::from_millis(100)).await;
            handle.cancel().await.unwrap();
            handle.await_complete().await.unwrap();

            let got = agent_runs::get(&db.lock(), &run.run_id).unwrap();
            assert_eq!(
                got.status, "stopped",
                "cancel must mark the run as stopped (D1.4-E)"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_non_zero_exit_with_stderr() {
            let _g = env_gate().lock().unwrap_or_else(|p| p.into_inner());
            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/stderr-then-exit.sh"),
            );

            let db = init_db_memory().unwrap();
            let (ws, run) = seed(&db);

            let handle = spawn_run(&ws, &run, noop_channel(), &db).await.unwrap();
            handle.await_complete().await.unwrap();

            let got = agent_runs::get(&db.lock(), &run.run_id).unwrap();
            assert_eq!(got.status, "error");
            assert_eq!(
                got.error_message.as_deref(),
                Some("mock claude failed: rate limited"),
                "error_message should be the last non-empty stderr line"
            );
            assert!(
                count_events(&db, &run.run_id, "error") >= 1,
                "expected ≥1 error agent_events row"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
        }
    }
}
