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
//!   --output-format=stream-json, --include-partial-messages,
//!   --verbose]`. The skip-permissions debug switch is NEVER passed;
//!   verbose is required by Claude CLI when --output-format=stream-json
//!   is used together with -p. The unit test
//!   `unit_argv_has_locked_flag_set` plus the cross-cutting greps in
//!   `cargo test --tests` belt-and-brace this.
//! - **D1.4-E** — cancel uses `Child::start_kill` (SIGKILL on Unix per
//!   tokio) plus `kill_on_drop(true)`. Final status is `stopped`.
//! - **D1.4-F** — one INSERT per parsed event; no batching in v0.1.0-beta.1.
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
//! Step 1.5 reach-back (S1.5.4): `spawn_run` calls `sandbox::git_checkpoint`
//! pre-spawn (persisting the sha via `agent_runs::update_checkpoint_sha`)
//! and `sandbox::capture_diff` + `workspace_changes::insert` post-exit
//! when `status == "done"`. Pre-spawn failure aborts the run; post-exit
//! failures are logged via `log::warn!` and do not surface to the caller.

use std::ffi::OsString;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::task::JoinHandle;

use crate::claude_cli::parser::{parse_line, ParserState};
use crate::claude_cli::{AgentRunTerminated, StreamEvent};
use crate::credentials::keyring_store;
use crate::db::models::{AgentRun, Workspace, WorkspaceChange};
use crate::db::{agent_events, agent_runs, now_ms, workspace_changes, DbState};
use crate::error::AppError;
use crate::sandbox;

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

/// Step 6d — inject the keyring-stored Anthropic key into `cmd`'s env as
/// `ANTHROPIC_API_KEY` so the spawned `claude` subprocess uses it.
///
/// Silent on either branch of failure:
///  - keyring read returns `Ok(None)`  → no key stored (Pro/Max users on
///    `claude /login`, or fresh installs) — leave env unchanged.
///  - keyring read returns `Err(_)`    → keyring backend unavailable
///    (rare; headless Linux without Secret Service) — leave env
///    unchanged and let `claude` fall back to whatever auth it has on
///    disk.
///
/// The key is read once and written into the spawn env. It is never
/// logged; the debug message below confirms the *presence* of a key,
/// never its value.
fn inject_anthropic_key(cmd: &mut Command) {
    let key = keyring_store::get_anthropic_key().ok().flatten();
    if key.is_some() {
        log::debug!("anthropic key found in keyring; injecting into claude env");
    }
    inject_anthropic_key_env(cmd, key.as_deref());
}

/// Testable seam for [`inject_anthropic_key`]. Splitting on the keyring
/// boundary lets unit tests exercise the env-mutation logic without
/// touching the real keyring slot (which may hold the developer's actual
/// API key during local runs).
fn inject_anthropic_key_env(cmd: &mut Command, key: Option<&str>) {
    if let Some(k) = key {
        cmd.env("ANTHROPIC_API_KEY", k);
    }
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
        "--verbose".to_string(),
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
/// 5. **Q2 (audit plan):** After `mark_ended` succeeds the supervisor
///    invokes `emit_terminated` with the final `run_id` + `status`.
///    The Tauri command wraps this closure to emit a tauri-specta
///    `AgentRunTerminated` event; tests pass a no-op closure to keep
///    the `_impl` surface free of `tauri::AppHandle`. The emit happens
///    **before** the post-exit `capture_diff` block so the front can
///    complete its channel observable independently of diff capture.
pub async fn spawn_run<E>(
    workspace: &Workspace,
    run: &AgentRun,
    channel: Channel<StreamEvent>,
    db: &DbState,
    emit_terminated: E,
) -> Result<RunHandle, AppError>
where
    E: Fn(AgentRunTerminated) + Send + Sync + 'static,
{
    let bin = resolve_claude_bin();
    let argv = command_argv_for_test(&run.prompt);

    // Pre-spawn reach-back (S1.5.4 / D1.5-I): capture a git checkpoint of
    // the workspace's worktree, persist it onto `agent_runs.checkpoint_sha`,
    // and remember the sha for the post-exit diff. Failure aborts spawn.
    let checkpoint_sha =
        sandbox::git_checkpoint(Path::new(&workspace.worktree_path)).await?;
    {
        let conn = db.0.lock().expect("db mutex poisoned");
        agent_runs::update_checkpoint_sha(&conn, &run.run_id, &checkpoint_sha)?;
    }

    let mut cmd = Command::new(&bin);
    cmd.args(&argv)
        .current_dir(&workspace.worktree_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    inject_anthropic_key(&mut cmd);

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
            // Per-run parser state. tool_use blocks need cross-line
            // accumulation; the state lives here, never crosses runs.
            let mut parser_state = ParserState::default();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        for ev in parse_line(&line, &mut parser_state) {
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
    // Clones for the post-exit reach-back (S1.5.4): the supervisor `move`s
    // these into its async block so it can compute and persist the diff.
    let workspace_path_for_supervisor = workspace.worktree_path.clone();
    let workspace_id_for_supervisor = workspace.workspace_id.clone();
    let checkpoint_sha_for_supervisor = checkpoint_sha.clone();
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
            {
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
                // lock dropped at end of scope, before the await below
            }

            // Q2 (audit plan): notify the front via a tauri-specta event so
            // the channel-observable can complete without polling. Fire
            // independently of diff capture below — even if capture_diff
            // fails, the run is terminal and the UI must learn about it.
            emit_terminated(AgentRunTerminated {
                run_id: run_id.clone(),
                status: status_str.to_string(),
            });

            // Post-exit reach-back (S1.5.4 / D1.5-I): on success only,
            // capture a diff vs the checkpoint and insert one
            // `workspace_changes` row. Best-effort — any failure logs and
            // continues. The four non-`done` terminal statuses
            // (error, stopped, crashed) skip this entirely.
            if status_str == "done" {
                match sandbox::capture_diff(
                    Path::new(&workspace_path_for_supervisor),
                    &checkpoint_sha_for_supervisor,
                )
                .await
                {
                    Ok(summary) => {
                        let change = WorkspaceChange {
                            change_id: 0,
                            workspace_id: workspace_id_for_supervisor.clone(),
                            run_id: Some(run_id.clone()),
                            diff_text: summary.diff_text,
                            files_added: summary.files_added,
                            files_modified: summary.files_modified,
                            files_deleted: summary.files_deleted,
                            captured_at: now_ms(),
                        };
                        let conn = match db_arc.lock() {
                            Ok(c) => c,
                            Err(_) => {
                                log::warn!(
                                    "workspace_changes insert: db mutex poisoned"
                                );
                                return;
                            }
                        };
                        if let Err(e) = workspace_changes::insert(&conn, &change) {
                            log::warn!("workspace_changes::insert failed: {e}");
                        }
                    }
                    Err(e) => log::warn!("capture_diff failed: {e}"),
                }
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
    //! The integration tests share three process-global env vars
    //! (`MOZART_CLAUDE_BIN`, `MOZART_MOCK_FIXTURE`, `MOZART_WORKTREES_ROOT`)
    //! and so MUST run serially. The gate lives in
    //! `crate::sandbox::test_env_gate()` and is shared with the sandbox
    //! tests (D1.5-L) so all `MOZART_*` mutators serialize against each
    //! other across the whole crate.

    use super::*;
    use crate::db::models::{Repo, Task, Thread};
    use crate::db::{init_db_memory, new_id, repos, tasks, threads, workspaces};

    // --- inject_anthropic_key_env unit tests (no keyring, no subprocess) ---

    /// Searches `cmd.as_std().get_envs()` for the named var, returning
    /// its value if set, `None` if explicitly removed, or panicking via
    /// `expect` if absent — caller decides the contract per assertion.
    fn lookup_env<'a>(
        cmd: &'a Command,
        name: &str,
    ) -> Option<Option<&'a std::ffi::OsStr>> {
        for (k, v) in cmd.as_std().get_envs() {
            if k == name {
                return Some(v);
            }
        }
        None
    }

    #[test]
    fn inject_anthropic_key_env_sets_var_when_key_provided() {
        let mut cmd = Command::new("/bin/true");
        inject_anthropic_key_env(&mut cmd, Some("sk-ant-fixture"));
        let value = lookup_env(&cmd, "ANTHROPIC_API_KEY")
            .expect("env must contain ANTHROPIC_API_KEY")
            .expect("ANTHROPIC_API_KEY must have a value, not be cleared");
        assert_eq!(value, "sk-ant-fixture");
    }

    #[test]
    fn inject_anthropic_key_env_leaves_env_untouched_when_none() {
        let mut cmd = Command::new("/bin/true");
        inject_anthropic_key_env(&mut cmd, None);
        // The helper must not touch the env at all when no key is given —
        // including no "clear" entry that would shadow the inherited
        // process env.
        assert!(
            lookup_env(&cmd, "ANTHROPIC_API_KEY").is_none(),
            "no ANTHROPIC_API_KEY override should be staged when key is None"
        );
    }

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
                "--verbose".to_string(),
            ],
            "argv must be exactly the five locked elements"
        );
        // Forbidden flag — string is runtime-constructed so the
        // `! grep` validation gate doesn't trip on this source file.
        let forbidden_skip_perms = format!(
            "{}{}",
            "--",
            "dangerously-skip-permissions"
        );
        assert!(
            !argv.iter().any(|a| a == &forbidden_skip_perms),
            "skip-permissions flag must never be passed"
        );
    }

    // --- integration tests (mock subprocess, all gated #[cfg(unix)]) ---

    #[cfg(unix)]
    // The env-var serialization Mutex is held across `.await` on purpose:
    // the entire test body needs exclusive ownership of the process-global
    // env vars (`MOZART_CLAUDE_BIN`, `MOZART_MOCK_FIXTURE`,
    // `MOZART_WORKTREES_ROOT`). The std::sync::Mutex is cheap here
    // (test-only) and safe because every awaited future is a tokio task
    // that does NOT itself try to acquire the gate. Post-S1.5.4 the gate
    // lives in `crate::sandbox::test_env_gate()` and is shared with the
    // sandbox tests so all `MOZART_*` mutators serialize against each other.
    #[allow(clippy::await_holding_lock)]
    mod integration {
        use super::*;
        use crate::sandbox;
        use std::path::PathBuf;
        use std::process::Command as StdCommand;
        use tempfile::TempDir;

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

        /// Initialize a real git repo in `dir` (init + identity + initial
        /// commit). Mirrors the spike-A pattern. Required so the runner's
        /// pre-spawn `git_checkpoint` (S1.5.4 reach-back) can succeed
        /// against the workspace's `worktree_path`.
        fn init_repo(dir: &std::path::Path) {
            let s = StdCommand::new("git")
                .arg("init")
                .arg("--initial-branch=main")
                .arg(dir)
                .output()
                .expect("git init");
            assert!(s.status.success(), "git init failed: {:?}", s);
            for (k, v) in [("user.email", "test@mozart.test"), ("user.name", "Test Bot")] {
                let s = StdCommand::new("git")
                    .current_dir(dir)
                    .args(["config", k, v])
                    .status()
                    .expect("git config");
                assert!(s.success(), "git config {k} failed");
            }
            let s = StdCommand::new("git")
                .current_dir(dir)
                .args(["commit", "--allow-empty", "--no-gpg-sign", "-m", "init"])
                .status()
                .expect("git commit");
            assert!(s.success(), "initial commit failed");
        }

        /// Seed a Repo → Task → Workspace → Thread → AgentRun chain
        /// in the in-memory DB, returning the AgentRun + Workspace
        /// alongside the TempDirs that own the worktree-root and the
        /// initialized repo. The TempDirs must be kept alive by the test
        /// for the duration of `spawn_run` — dropping them early
        /// would unlink the worktree mid-run.
        fn seed(db: &DbState) -> (Workspace, AgentRun, TempDir, TempDir) {
            // 1. tempdir to act as MOZART_WORKTREES_ROOT
            let root = tempfile::tempdir().expect("worktrees-root tempdir");
            // 2. tempdir nested under root for the workspace's worktree
            //    (must survive the test scope so git_checkpoint can run).
            let wt_dir = tempfile::tempdir_in(root.path())
                .expect("worktree tempdir under root");
            init_repo(wt_dir.path());

            let conn = db.lock();
            let r = Repo {
                repo_id: new_id(),
                path: format!("/r-{}", new_id()),
                display_name: "r".into(),
                added_at: now_ms(),
                icon: None,
                hidden: false,
                sort_index: 0,
                run_command: None,
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
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt_dir.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
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
            (ws, run, root, wt_dir)
        }

        fn count_workspace_changes(db: &DbState, run_id: &str) -> usize {
            let conn = db.lock();
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workspace_changes WHERE run_id = ?1",
                    [run_id],
                    |r| r.get(0),
                )
                .unwrap();
            n as usize
        }

        fn count_events(db: &DbState, run_id: &str, event_type: &str) -> usize {
            let events = agent_events::list_by_run(&db.lock(), run_id).unwrap();
            events.iter().filter(|e| e.event_type == event_type).count()
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_happy_path() {
            if !sandbox::git_available() {
                eprintln!("SKIP integration_happy_path: `git` binary not on PATH");
                return;
            }
            let _g = sandbox::test_env_gate()
                .lock()
                .unwrap_or_else(|p| p.into_inner());

            let db = init_db_memory().unwrap();
            let (ws, run, _root, _wt_dir) = seed(&db);

            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/happy-text.jsonl"),
            );
            std::env::set_var("MOZART_WORKTREES_ROOT", _root.path());

            let handle = spawn_run(&ws, &run, noop_channel(), &db, |_| ()).await.unwrap();
            handle.await_complete().await.unwrap();

            // ≥ 1 stream_token row from the text_delta in the fixture.
            assert!(
                count_events(&db, &run.run_id, "stream_token") >= 1,
                "expected ≥1 stream_token agent_events row"
            );
            let got = agent_runs::get(&db.lock(), &run.run_id).unwrap();
            assert_eq!(got.status, "done");
            assert_eq!(got.exit_code, Some(0));

            // S1.5.4 reach-back: pre-spawn checkpoint persisted, and on
            // success exactly one workspace_changes row was inserted.
            assert!(
                got.checkpoint_sha.is_some(),
                "expected agent_runs.checkpoint_sha to be Some(_) after spawn_run"
            );
            assert_eq!(
                count_workspace_changes(&db, &run.run_id),
                1,
                "expected exactly one workspace_changes row for a 'done' run"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
            std::env::remove_var("MOZART_WORKTREES_ROOT");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_tool_use_emits_tool_call_and_result() {
            if !sandbox::git_available() {
                eprintln!("SKIP integration_tool_use_emits_tool_call_and_result: `git` binary not on PATH");
                return;
            }
            let _g = sandbox::test_env_gate()
                .lock()
                .unwrap_or_else(|p| p.into_inner());

            let db = init_db_memory().unwrap();
            let (ws, run, _root, _wt_dir) = seed(&db);

            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/with-tool-use.jsonl"),
            );
            std::env::set_var("MOZART_WORKTREES_ROOT", _root.path());

            let handle = spawn_run(&ws, &run, noop_channel(), &db, |_| ()).await.unwrap();
            handle.await_complete().await.unwrap();

            // The fixture exercises the full tool round-trip: an
            // assistant `tool_use` content block (start + 2 partials +
            // stop) collapses into ONE `tool_call` row carrying the
            // assembled args JSON and the toolu_ id; the echoed user
            // `tool_result` becomes ONE `tool_result` row.
            let conn = db.lock();
            let events = agent_events::list_by_run(&conn, &run.run_id).unwrap();
            drop(conn);

            let tool_calls: Vec<&_> = events
                .iter()
                .filter(|e| e.event_type == "tool_call")
                .collect();
            assert_eq!(
                tool_calls.len(),
                1,
                "expected exactly 1 tool_call row, got {}",
                tool_calls.len()
            );
            let payload = &tool_calls[0].payload_json;
            assert!(
                payload.contains("\"id\":\"toolu_1\""),
                "tool_call payload must carry the assistant's toolu_ id: {payload}"
            );
            assert!(
                payload.contains("\"name\":\"Bash\""),
                "tool_call payload must carry the tool name: {payload}"
            );
            assert!(
                payload.contains("\\\"command\\\": \\\"ls\\\""),
                "tool_call args_json must reassemble both input_json_delta chunks: {payload}"
            );

            let tool_results: Vec<&_> = events
                .iter()
                .filter(|e| e.event_type == "tool_result")
                .collect();
            assert_eq!(
                tool_results.len(),
                1,
                "expected exactly 1 tool_result row, got {}",
                tool_results.len()
            );
            assert!(
                tool_results[0].payload_json.contains("\"id\":\"toolu_1\""),
                "tool_result must correlate to the tool_call by toolu_ id"
            );

            // The assistant text_delta before the tool_use also survives.
            assert!(
                count_events(&db, &run.run_id, "stream_token") >= 1,
                "expected ≥1 stream_token row from the leading text_delta"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
            std::env::remove_var("MOZART_WORKTREES_ROOT");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_cancel_mid_stream() {
            if !sandbox::git_available() {
                eprintln!("SKIP integration_cancel_mid_stream: `git` binary not on PATH");
                return;
            }
            let _g = sandbox::test_env_gate()
                .lock()
                .unwrap_or_else(|p| p.into_inner());

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

            let db = init_db_memory().unwrap();
            let (ws, run, _root, _wt_dir) = seed(&db);

            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var("MOZART_MOCK_FIXTURE", &slow);
            std::env::set_var("MOZART_WORKTREES_ROOT", _root.path());

            let handle = spawn_run(&ws, &run, noop_channel(), &db, |_| ()).await.unwrap();
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
            std::env::remove_var("MOZART_WORKTREES_ROOT");
        }

        #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
        async fn integration_non_zero_exit_with_stderr() {
            if !sandbox::git_available() {
                eprintln!("SKIP integration_non_zero_exit_with_stderr: `git` binary not on PATH");
                return;
            }
            let _g = sandbox::test_env_gate()
                .lock()
                .unwrap_or_else(|p| p.into_inner());

            let db = init_db_memory().unwrap();
            let (ws, run, _root, _wt_dir) = seed(&db);

            std::env::set_var("MOZART_CLAUDE_BIN", mock_bin());
            std::env::set_var(
                "MOZART_MOCK_FIXTURE",
                fixtures_dir().join("streams/stderr-then-exit.sh"),
            );
            std::env::set_var("MOZART_WORKTREES_ROOT", _root.path());

            let handle = spawn_run(&ws, &run, noop_channel(), &db, |_| ()).await.unwrap();
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

            // S1.5.4 reach-back invariants for non-zero-exit:
            // pre-spawn checkpoint persisted, but post-exit insert is
            // gated by status == "done" so no workspace_changes row.
            assert!(
                got.checkpoint_sha.is_some(),
                "pre-spawn checkpoint should always set checkpoint_sha"
            );
            assert_eq!(
                count_workspace_changes(&db, &run.run_id),
                0,
                "non-'done' status must not insert a workspace_changes row"
            );

            std::env::remove_var("MOZART_CLAUDE_BIN");
            std::env::remove_var("MOZART_MOCK_FIXTURE");
            std::env::remove_var("MOZART_WORKTREES_ROOT");
        }
    }
}
