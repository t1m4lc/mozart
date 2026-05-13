//! Tauri command surface for Mozart's desktop app. Each command is
//! `#[tauri::command] #[specta::specta]` so `bindings_export.rs` can
//! collect them into a typed TS surface. v0.0.1 = 12 commands per the
//! atomized plan (S1.7.1b — stubs; S1.7.3 — bodies).
//!
//! Field-naming contract (plan §4, D17 vocabulary): argument identifiers
//! use canonical concepts only (`workspace_id`, `task_id`, `run_id`,
//! `repo_id`, `prompt`, `path`). No `worktree_path` / `branch_name` /
//! `agent/wip-…` may appear as command arguments.
//!
//! Each `#[tauri::command]` wrapper is a thin shim over a
//! `pub(crate) async fn <name>_impl(...)` that takes plain references
//! to `DbState` / `RunRegistry` instead of `tauri::State`. The split
//! exists so tests can drive the real command logic without a Tauri
//! runtime (`tauri::State` cannot be constructed in tests). The wrapper
//! is the spec surface; the `_impl` is the testable surface.

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::claude_cli::install::{self, ClaudeInstall};
use crate::claude_cli::session;
use crate::claude_cli::{spawn_run, AgentRunTerminated, StreamEvent};
use crate::credentials::anthropic_probe::{self, ProbeResult};
use crate::credentials::keyring_store;
use crate::db::models::{AgentRun, Repo, Task, Workspace, WorkspaceChange};
use crate::db::{agent_runs, new_id, now_ms, repos, tasks, threads, workspace_changes, workspaces};
use crate::db::DbState;
use crate::error::AppError;
use crate::git_query;
use crate::run_registry::RunRegistry;
use crate::sandbox;
use crate::workspace_service;

// ---------------------------------------------------------------------------
// list_repos
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn list_repos(db: State<'_, DbState>) -> Result<Vec<Repo>, AppError> {
    list_repos_impl(db.inner()).await
}

pub(crate) async fn list_repos_impl(db: &DbState) -> Result<Vec<Repo>, AppError> {
    let conn = db.lock();
    repos::list(&conn)
}

// ---------------------------------------------------------------------------
// add_repo
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn add_repo(db: State<'_, DbState>, path: String) -> Result<Repo, AppError> {
    add_repo_impl(db.inner(), path).await
}

pub(crate) async fn add_repo_impl(db: &DbState, path: String) -> Result<Repo, AppError> {
    let p = std::path::Path::new(&path);
    // Validate first; RepoIssue is collapsed into AppError::Validation.
    git_query::validate_repo(p)
        .await
        .map_err(|issue| AppError::Validation(format!("repo not usable: {issue:?}")))?;
    let conn = db.lock();
    // Idempotent: if path already registered, return the existing row.
    if let Ok(existing) = repos::get_by_path(&conn, &path) {
        return Ok(existing);
    }
    let r = Repo {
        repo_id: new_id(),
        path: path.clone(),
        display_name: p
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone()),
        added_at: now_ms(),
        icon: None,
        hidden: false,
        sort_index: 0,
    };
    repos::create(&conn, &r)?;
    Ok(r)
}

// ---------------------------------------------------------------------------
// remove_repo
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn remove_repo(db: State<'_, DbState>, repo_id: String) -> Result<(), AppError> {
    remove_repo_impl(db.inner(), repo_id).await
}

pub(crate) async fn remove_repo_impl(db: &DbState, repo_id: String) -> Result<(), AppError> {
    let conn = db.lock();
    repos::delete(&conn, &repo_id)
}

// ---------------------------------------------------------------------------
// set_repo_icon
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn set_repo_icon(
    db: State<'_, DbState>,
    repo_id: String,
    icon: Option<String>,
) -> Result<(), AppError> {
    set_repo_icon_impl(db.inner(), repo_id, icon).await
}

pub(crate) async fn set_repo_icon_impl(
    db: &DbState,
    repo_id: String,
    icon: Option<String>,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_icon(&conn, &repo_id, icon.as_deref())
}

// ---------------------------------------------------------------------------
// set_repo_hidden
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn set_repo_hidden(
    db: State<'_, DbState>,
    repo_id: String,
    hidden: bool,
) -> Result<(), AppError> {
    set_repo_hidden_impl(db.inner(), repo_id, hidden).await
}

pub(crate) async fn set_repo_hidden_impl(
    db: &DbState,
    repo_id: String,
    hidden: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_hidden(&conn, &repo_id, hidden)
}

// ---------------------------------------------------------------------------
// set_repo_sort
// ---------------------------------------------------------------------------

/// Apply a complete project ordering. `ordered_ids[i]` gets
/// `sort_index = i`. The Angular store debounces drag bursts so this
/// fires once per drop, not per dragOver.
#[tauri::command]
#[specta::specta]
pub async fn set_repo_sort(
    db: State<'_, DbState>,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    set_repo_sort_impl(db.inner(), ordered_ids).await
}

pub(crate) async fn set_repo_sort_impl(
    db: &DbState,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut conn = db.lock();
    repos::set_sort(&mut conn, &ordered_ids)
}

// ---------------------------------------------------------------------------
// list_branches
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn list_branches(repo_path: String) -> Result<Vec<String>, AppError> {
    git_query::list_branches(std::path::Path::new(&repo_path)).await
}

// ---------------------------------------------------------------------------
// create_workspace
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn create_workspace(
    db: State<'_, DbState>,
    repo_id: String,
    base_branch: String,
    task_text: String,
    workspace_name: String,
) -> Result<Workspace, AppError> {
    create_workspace_impl(db.inner(), repo_id, base_branch, task_text, workspace_name).await
}

pub(crate) async fn create_workspace_impl(
    db: &DbState,
    repo_id: String,
    base_branch: String,
    task_text: String,
    workspace_name: String,
) -> Result<Workspace, AppError> {
    // Resolve repo_id -> repo_path via repos::get (added in S1.7.1a).
    let repo_path = {
        let conn = db.lock();
        repos::get(&conn, &repo_id)?.path
    };
    workspace_service::create_workspace(
        db,
        &repo_id,
        std::path::Path::new(&repo_path),
        &base_branch,
        &task_text,
        &workspace_name,
    )
    .await
}

// ---------------------------------------------------------------------------
// list_workspaces
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn list_workspaces(db: State<'_, DbState>) -> Result<Vec<Workspace>, AppError> {
    list_workspaces_impl(db.inner()).await
}

pub(crate) async fn list_workspaces_impl(db: &DbState) -> Result<Vec<Workspace>, AppError> {
    let conn = db.lock();
    workspaces::list_all(&conn)
}

// ---------------------------------------------------------------------------
// list_tasks
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn list_tasks(
    db: State<'_, DbState>,
    repo_id: String,
) -> Result<Vec<Task>, AppError> {
    list_tasks_impl(db.inner(), repo_id).await
}

pub(crate) async fn list_tasks_impl(
    db: &DbState,
    repo_id: String,
) -> Result<Vec<Task>, AppError> {
    let conn = db.lock();
    tasks::list_by_repo(&conn, &repo_id)
}

// ---------------------------------------------------------------------------
// archive_workspace
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn archive_workspace(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<(), AppError> {
    archive_workspace_impl(db.inner(), workspace_id).await
}

pub(crate) async fn archive_workspace_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_deletion_intent(&conn, &workspace_id, true)
}

// ---------------------------------------------------------------------------
// set_workspace_pinned
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn set_workspace_pinned(
    db: State<'_, DbState>,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    set_workspace_pinned_impl(db.inner(), workspace_id, pinned).await
}

pub(crate) async fn set_workspace_pinned_impl(
    db: &DbState,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_pinned(&conn, &workspace_id, pinned)
}

// ---------------------------------------------------------------------------
// set_workspace_unread
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn set_workspace_unread(
    db: State<'_, DbState>,
    workspace_id: String,
    unread: bool,
) -> Result<(), AppError> {
    set_workspace_unread_impl(db.inner(), workspace_id, unread).await
}

pub(crate) async fn set_workspace_unread_impl(
    db: &DbState,
    workspace_id: String,
    unread: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_unread(&conn, &workspace_id, unread)
}

// ---------------------------------------------------------------------------
// start_agent_run
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn start_agent_run(
    db: State<'_, DbState>,
    registry: State<'_, RunRegistry>,
    app: tauri::AppHandle,
    workspace_id: String,
    prompt: String,
    on_event: Channel<StreamEvent>,
) -> Result<AgentRun, AppError> {
    // Capture an owned `AppHandle` so the emitter closure can outlive the
    // command frame. Q2: tauri-specta event drives natural-end on the front.
    let app_clone = app.clone();
    start_agent_run_impl(
        db.inner(),
        registry.inner(),
        workspace_id,
        prompt,
        on_event,
        move |ev| {
            use tauri_specta::Event;
            // Best-effort: an emit failure (e.g. webview gone during
            // shutdown) is logged and swallowed — the run is already
            // terminal in the DB and the UI will reconcile on next list.
            if let Err(e) = ev.emit(&app_clone) {
                log::warn!("AgentRunTerminated emit failed: {e}");
            }
        },
    )
    .await
}

pub(crate) async fn start_agent_run_impl<E>(
    db: &DbState,
    registry: &RunRegistry,
    workspace_id: String,
    prompt: String,
    on_event: Channel<StreamEvent>,
    emit_terminated: E,
) -> Result<AgentRun, AppError>
where
    E: Fn(AgentRunTerminated) + Send + Sync + 'static,
{
    // D20: 1:1 workspace -> thread traversal.
    let (ws, thread) = {
        let conn = db.lock();
        (
            workspaces::get(&conn, &workspace_id)?,
            threads::get_by_workspace(&conn, &workspace_id)?,
        )
    };
    let run = AgentRun {
        run_id: new_id(),
        thread_id: thread.thread_id,
        prompt,
        status: "running".into(),
        started_at: now_ms(),
        ended_at: None,
        exit_code: None,
        error_message: None,
        checkpoint_sha: None,
    };
    {
        let conn = db.lock();
        agent_runs::create(&conn, &run)?;
    }
    let handle = spawn_run(&ws, &run, on_event, db, emit_terminated).await?;
    registry.register(run.run_id.clone(), Arc::new(handle));
    Ok(run)
}

// ---------------------------------------------------------------------------
// stop_agent_run
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn stop_agent_run(
    registry: State<'_, RunRegistry>,
    run_id: String,
) -> Result<(), AppError> {
    stop_agent_run_impl(registry.inner(), run_id).await
}

pub(crate) async fn stop_agent_run_impl(
    registry: &RunRegistry,
    run_id: String,
) -> Result<(), AppError> {
    registry.cancel(&run_id).await
}

// ---------------------------------------------------------------------------
// list_runs
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn list_runs(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    list_runs_impl(db.inner(), workspace_id).await
}

pub(crate) async fn list_runs_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    let conn = db.lock();
    let thread = threads::get_by_workspace(&conn, &workspace_id)?;
    agent_runs::list_by_thread(&conn, &thread.thread_id)
}

// ---------------------------------------------------------------------------
// get_workspace_diff
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn get_workspace_diff(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    get_workspace_diff_impl(db.inner(), workspace_id).await
}

pub(crate) async fn get_workspace_diff_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    let conn = db.lock();
    workspace_changes::latest_for_workspace(&conn, &workspace_id)
}

// ---------------------------------------------------------------------------
// discard_workspace_changes
// ---------------------------------------------------------------------------

/// "Undo the last agent run." Resets the worktree to the most-recent
/// `agent_runs.checkpoint_sha` for this workspace's thread. Only the
/// latest run's diff is reverted; earlier-run diffs that were never
/// committed upstream stay in the worktree. With no prior run that
/// captured a checkpoint, returns `AppError::Validation` (UI shows a
/// friendly "nothing to discard" toast). For the v0.0.1 single-decision
/// flow (one run per archive/discard cycle) this matches the user's
/// mental model.
#[tauri::command]
#[specta::specta]
pub async fn discard_workspace_changes(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<(), AppError> {
    discard_workspace_changes_impl(db.inner(), workspace_id).await
}

pub(crate) async fn discard_workspace_changes_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, checkpoint_sha) = {
        let conn = db.lock();
        let ws = workspaces::get(&conn, &workspace_id)?;
        let thread = threads::get_by_workspace(&conn, &workspace_id)?;
        let runs = agent_runs::list_by_thread(&conn, &thread.thread_id)?;
        let sha = runs
            .iter()
            .rev()
            .find_map(|r| r.checkpoint_sha.clone())
            .ok_or_else(|| {
                AppError::Validation("no checkpoint to discard to (no agent runs yet)".into())
            })?;
        (ws.worktree_path, sha)
    };
    sandbox::discard_changes_to(std::path::Path::new(&worktree_path), &checkpoint_sha).await
}

// ---------------------------------------------------------------------------
// check_claude_install
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn check_claude_install() -> ClaudeInstall {
    install::check_installed().await
}

// ---------------------------------------------------------------------------
// check_claude_code_session
// ---------------------------------------------------------------------------

/// Step 6d — heuristic probe for an existing `claude /login` session. The
/// frontend uses this to give Pro/Max users a single-click "Connect"
/// experience that bypasses the API-key dialog when their CLI is already
/// authenticated.
#[tauri::command]
#[specta::specta]
pub async fn check_claude_code_session() -> bool {
    session::has_session()
}

// ---------------------------------------------------------------------------
// has_anthropic_key
// ---------------------------------------------------------------------------

/// Step 6 — cheap presence check used by the frontend on app start to know
/// whether to render "Not connected" immediately or to kick off a probe.
/// Never returns the value of the key.
#[tauri::command]
#[specta::specta]
pub async fn has_anthropic_key() -> Result<bool, AppError> {
    keyring_store::has_anthropic_key()
}

// ---------------------------------------------------------------------------
// connect_anthropic
// ---------------------------------------------------------------------------

/// Step 6 — probe-then-persist. Only writes to the keyring when the probe
/// returns `Connected`. On `Invalid` / `NetworkError` the key is dropped at
/// the end of this function frame and never touches disk. The argument
/// `key` is the only place the value is ever passed by-value into Mozart
/// from the frontend.
#[tauri::command]
#[specta::specta]
pub async fn connect_anthropic(key: String) -> Result<ProbeResult, AppError> {
    let result = anthropic_probe::probe(&key).await;
    if matches!(result, ProbeResult::Connected) {
        keyring_store::set_anthropic_key(&key)?;
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// disconnect_anthropic
// ---------------------------------------------------------------------------

/// Step 6 — idempotent removal of the stored key. Safe to call when no
/// entry exists.
#[tauri::command]
#[specta::specta]
pub async fn disconnect_anthropic() -> Result<(), AppError> {
    keyring_store::clear_anthropic_key()
}

// ---------------------------------------------------------------------------
// refresh_anthropic_connection
// ---------------------------------------------------------------------------

/// Step 6 — re-probe the currently stored key. Returns `Validation` when no
/// key is stored (the frontend gates this call on `has_anthropic_key()` so
/// the error path is only hit on misuse).
#[tauri::command]
#[specta::specta]
pub async fn refresh_anthropic_connection() -> Result<ProbeResult, AppError> {
    match keyring_store::get_anthropic_key()? {
        Some(k) => Ok(anthropic_probe::probe(&k).await),
        None => Err(AppError::Validation("no stored anthropic key".into())),
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{Repo, Task, Thread};
    use crate::db::{init_db_memory, tasks};
    use std::path::Path;
    use std::process::Command;

    // -------------------------------------------------------------------
    // Shared helpers
    // -------------------------------------------------------------------

    fn noop_channel() -> Channel<StreamEvent> {
        Channel::new(|_| Ok(()))
    }

    /// Build a tempdir-backed git repo with identity + one seed commit on
    /// `main`. Mirrors `workspace_service.rs::tests::init_repo_with_main`.
    fn init_repo_with_main(repo: &Path) {
        let s = Command::new("git")
            .arg("init")
            .arg("--initial-branch=main")
            .arg(repo)
            .output()
            .expect("git init");
        assert!(s.status.success(), "git init failed: {:?}", s);
        for (k, v) in [
            ("user.email", "test@mozart.test"),
            ("user.name", "Test Bot"),
        ] {
            let s = Command::new("git")
                .current_dir(repo)
                .args(["config", k, v])
                .output()
                .expect("git config");
            assert!(s.status.success(), "git config {k} failed");
        }
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        let s = Command::new("git")
            .current_dir(repo)
            .args(["add", "-A"])
            .output()
            .expect("git add");
        assert!(s.status.success(), "git add failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--no-gpg-sign", "-m", "seed"])
            .output()
            .expect("git commit");
        assert!(s.status.success(), "git commit failed: {:?}", s);
    }

    fn restore_root(prev: Option<std::ffi::OsString>) {
        match prev {
            Some(v) => std::env::set_var("MOZART_WORKTREES_ROOT", v),
            None => std::env::remove_var("MOZART_WORKTREES_ROOT"),
        }
    }

    fn seed_repo_row(db: &DbState, path: &str) -> String {
        let conn = db.lock();
        let r = Repo {
            repo_id: new_id(),
            path: path.into(),
            display_name: "test".into(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
        };
        repos::create(&conn, &r).unwrap();
        r.repo_id
    }

    /// Seed Task + Workspace + Thread for a given repo_id.
    /// Returns (workspace_id, thread_id).
    fn seed_workspace_chain(db: &DbState, repo_id: &str) -> (String, String) {
        let conn = db.lock();
        let t = Task {
            task_id: new_id(),
            repo_id: repo_id.into(),
            title: "t".into(),
            task_text: "t".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        tasks::create(&conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(),
            task_id: t.task_id.clone(),
            name: "ws-seed".into(),
            worktree_path: format!("/wt-{}", new_id()),
            branch_name: "agent/wip-x".into(),
            base_branch: "main".into(),
            status: "ready".into(),
            pinned: false,
            unread: false,
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
        (ws.workspace_id, th.thread_id)
    }

    // -------------------------------------------------------------------
    // 1. list_repos
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn list_repos_returns_empty_then_seeded() {
        let db = init_db_memory().unwrap();
        let got = list_repos_impl(&db).await.unwrap();
        assert!(got.is_empty(), "expected empty list initially");
        let _ = seed_repo_row(&db, "/tmp/seeded-repo");
        let got = list_repos_impl(&db).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].path, "/tmp/seeded-repo");
    }

    // -------------------------------------------------------------------
    // 2. add_repo — happy path
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn add_repo_validates_then_creates_repo_row() {
        if !sandbox::git_available() {
            eprintln!("SKIP add_repo_validates_then_creates_repo_row: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("my-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let path_str = repo.to_string_lossy().into_owned();
        let got = add_repo_impl(&db, path_str.clone()).await.unwrap();
        assert_eq!(got.path, path_str);
        assert_eq!(got.display_name, "my-repo");
    }

    // -------------------------------------------------------------------
    // 3. add_repo — idempotent
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn add_repo_idempotent_returns_existing() {
        if !sandbox::git_available() {
            eprintln!("SKIP add_repo_idempotent_returns_existing: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("idem-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let path_str = repo.to_string_lossy().into_owned();
        let first = add_repo_impl(&db, path_str.clone()).await.unwrap();
        let second = add_repo_impl(&db, path_str.clone()).await.unwrap();
        assert_eq!(
            first.repo_id, second.repo_id,
            "second add_repo for the same path must return the existing row"
        );
        // Exactly one row in the DB.
        let conn = db.lock();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "no duplicate row may be inserted");
    }

    // -------------------------------------------------------------------
    // 3a. remove_repo / set_repo_icon / set_repo_hidden / set_repo_sort
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn remove_repo_deletes_row() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/rm");
        remove_repo_impl(&db, id.clone()).await.unwrap();
        let n: i64 = db
            .lock()
            .query_row(
                "SELECT COUNT(*) FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0);
    }

    #[tokio::test]
    async fn remove_repo_unknown_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = remove_repo_impl(&db, "no-such".into()).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn set_repo_icon_round_trip() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/icon");
        set_repo_icon_impl(&db, id.clone(), Some("🎵".into()))
            .await
            .unwrap();
        let got: Option<String> = db
            .lock()
            .query_row(
                "SELECT icon FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got.as_deref(), Some("🎵"));
        set_repo_icon_impl(&db, id.clone(), None).await.unwrap();
        let got: Option<String> = db
            .lock()
            .query_row(
                "SELECT icon FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got, None);
    }

    #[tokio::test]
    async fn set_repo_hidden_round_trip() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/hid");
        set_repo_hidden_impl(&db, id.clone(), true).await.unwrap();
        let got: i64 = db
            .lock()
            .query_row(
                "SELECT hidden FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got, 1);
    }

    #[tokio::test]
    async fn set_repo_sort_applies_full_ordering() {
        let db = init_db_memory().unwrap();
        let a = seed_repo_row(&db, "/tmp/a");
        let b = seed_repo_row(&db, "/tmp/b");
        let c = seed_repo_row(&db, "/tmp/c");
        set_repo_sort_impl(&db, vec![c.clone(), a.clone(), b.clone()])
            .await
            .unwrap();
        let got = list_repos_impl(&db).await.unwrap();
        let paths: Vec<_> = got.iter().map(|r| r.path.clone()).collect();
        assert_eq!(paths, vec!["/tmp/c", "/tmp/a", "/tmp/b"]);
    }

    // -------------------------------------------------------------------
    // 4. list_branches
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn list_branches_returns_branches() {
        if !sandbox::git_available() {
            eprintln!("SKIP list_branches_returns_branches: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("lb-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let got = list_branches(repo.to_string_lossy().into_owned())
            .await
            .expect("list_branches ok");
        assert!(
            got.iter().any(|b| b == "main"),
            "expected branches to include 'main', got {got:?}"
        );
    }

    // -------------------------------------------------------------------
    // 5. create_workspace — happy path
    // -------------------------------------------------------------------

    // D1.5-L: env-gate Mutex is intentionally held across awaits.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_workspace_happy_path_via_command() {
        if !sandbox::git_available() {
            eprintln!("SKIP create_workspace_happy_path_via_command: git not on PATH");
            return;
        }
        let _gate = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, &repo.to_string_lossy());

        let ws = create_workspace_impl(
            &db,
            repo_id,
            "main".into(),
            "Add OAuth\nfull body".into(),
            "eminem".into(),
        )
        .await
        .expect("create_workspace_impl ok");
        assert_eq!(ws.status, "ready");
        assert_eq!(ws.name, "eminem");
        // Branch is derived from the workspace name.
        assert_eq!(ws.branch_name, "agent/eminem");

        restore_root(prev);
    }

    // -------------------------------------------------------------------
    // 6. list_workspaces
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn list_workspaces_returns_seeded() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lw");
        let _ = seed_workspace_chain(&db, &repo_id);
        let got = list_workspaces_impl(&db).await.unwrap();
        assert_eq!(got.len(), 1);
    }

    // -------------------------------------------------------------------
    // 6b. list_tasks
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn list_tasks_returns_seeded_tasks_for_repo() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lt");
        // First task comes from the shared seed helper.
        let _ = seed_workspace_chain(&db, &repo_id);
        // Second task: insert directly with a strictly-later created_at
        // to verify ordering through the command layer.
        let later_created_at = {
            let conn = db.lock();
            let max: i64 = conn
                .query_row(
                    "SELECT MAX(created_at) FROM tasks WHERE repo_id = ?1",
                    [&repo_id],
                    |r| r.get(0),
                )
                .unwrap();
            let t2 = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "second task".into(),
                task_text: "do second".into(),
                status: "active".into(),
                created_at: max + 1,
            };
            tasks::create(&conn, &t2).unwrap();
            t2.created_at
        };

        let got = list_tasks_impl(&db, repo_id.clone()).await.unwrap();
        assert_eq!(got.len(), 2, "expected exactly two tasks for the repo");
        assert!(
            got[0].created_at <= got[1].created_at,
            "tasks must be returned in ascending created_at order"
        );
        assert_eq!(
            got[1].created_at, later_created_at,
            "the latest-inserted task must come last"
        );
    }

    #[tokio::test]
    async fn list_tasks_returns_empty_for_unknown_repo() {
        let db = init_db_memory().unwrap();
        // Seed a real repo + chain so the tasks table is non-empty,
        // then query a different repo_id.
        let repo_id = seed_repo_row(&db, "/tmp/lt-empty");
        let _ = seed_workspace_chain(&db, &repo_id);

        let got = list_tasks_impl(&db, "no-such-repo".into()).await.unwrap();
        assert!(
            got.is_empty(),
            "unknown repo_id must yield empty Vec, not error"
        );
    }

    // -------------------------------------------------------------------
    // 7. archive_workspace
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn archive_workspace_flips_deletion_intent() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/aw");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        archive_workspace_impl(&db, ws_id.clone()).await.unwrap();
        let conn = db.lock();
        let ws = workspaces::get(&conn, &ws_id).unwrap();
        assert_eq!(ws.deletion_intent, 1);
    }

    // -------------------------------------------------------------------
    // 7a. set_workspace_pinned
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn set_workspace_pinned_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/swp");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        set_workspace_pinned_impl(&db, ws_id.clone(), true).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().pinned, true);
        set_workspace_pinned_impl(&db, ws_id.clone(), false).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().pinned, false);
    }

    #[tokio::test]
    async fn set_workspace_pinned_unknown_id_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = set_workspace_pinned_impl(&db, "no-such-ws".into(), true)
            .await
            .expect_err("unknown id must error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    // -------------------------------------------------------------------
    // 7b. set_workspace_unread
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn set_workspace_unread_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/swu");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        set_workspace_unread_impl(&db, ws_id.clone(), true).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().unread, true);
        set_workspace_unread_impl(&db, ws_id.clone(), false).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().unread, false);
    }

    #[tokio::test]
    async fn set_workspace_unread_unknown_id_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = set_workspace_unread_impl(&db, "no-such-ws".into(), true)
            .await
            .expect_err("unknown id must error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    // -------------------------------------------------------------------
    // 8. start_agent_run — happy path (unix + git only)
    // -------------------------------------------------------------------

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_creates_row_and_registers_handle() {
        if !sandbox::git_available() {
            eprintln!("SKIP start_agent_run_creates_row_and_registers_handle: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Build a real git-initialized worktree under a tempdir worktrees-root.
        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar");
        // Seed task + workspace + thread, but use the real wt path on the
        // workspace so git_checkpoint can run there.
        let (ws_id, _thread_id) = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
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
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
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
            (ws.workspace_id, th.thread_id)
        };

        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var(
            "MOZART_MOCK_FIXTURE",
            fixtures.join("streams/happy-text.jsonl"),
        );
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let registry = RunRegistry::new();
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            "do the thing".into(),
            noop_channel(),
            |_| (),
        )
        .await
        .expect("start_agent_run_impl ok");
        assert_eq!(run.status, "running");

        // The registry now has an entry; cancel by id must succeed.
        // Give the supervisor a moment to start before we tear down.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        registry
            .cancel(&run.run_id)
            .await
            .expect("registry has the run id");

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    // -------------------------------------------------------------------
    // 9. stop_agent_run — unknown id → NotFound; known id → ok
    // -------------------------------------------------------------------

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn stop_agent_run_cancels_known_run() {
        if !sandbox::git_available() {
            eprintln!("SKIP stop_agent_run_cancels_known_run: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Slow fixture so the run is alive when we stop it.
        let dir = tempfile::tempdir().unwrap();
        let slow = dir.path().join("slow.sh");
        std::fs::write(&slow, "#!/bin/sh\nsleep 10\necho should-not-appear\n").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&slow).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&slow, p).unwrap();
        }

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-stop");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
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
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
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
            ws.workspace_id
        };

        std::env::set_var("MOZART_CLAUDE_BIN", &slow);
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let registry = RunRegistry::new();
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            "do".into(),
            noop_channel(),
            |_| (),
        )
        .await
        .expect("start_agent_run_impl ok");

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        stop_agent_run_impl(&registry, run.run_id.clone())
            .await
            .expect("known run id cancels cleanly");

        // Unknown run id → NotFound.
        let err = stop_agent_run_impl(&registry, "no-such-run".into())
            .await
            .expect_err("unknown id must error");
        assert!(
            matches!(err, AppError::NotFound(_)),
            "expected NotFound, got {err:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    // -------------------------------------------------------------------
    // 10. list_runs
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn list_runs_returns_runs_for_workspace() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lr");
        let (ws_id, thread_id) = seed_workspace_chain(&db, &repo_id);
        {
            let conn = db.lock();
            for i in 0..2 {
                let r = AgentRun {
                    run_id: new_id(),
                    thread_id: thread_id.clone(),
                    prompt: format!("p{i}"),
                    status: "done".into(),
                    started_at: now_ms() + i,
                    ended_at: None,
                    exit_code: None,
                    error_message: None,
                    checkpoint_sha: None,
                };
                agent_runs::create(&conn, &r).unwrap();
            }
        }
        let got = list_runs_impl(&db, ws_id).await.unwrap();
        assert_eq!(got.len(), 2);
    }

    // -------------------------------------------------------------------
    // 11. get_workspace_diff
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn get_workspace_diff_returns_latest_or_none() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/gwd");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let got = get_workspace_diff_impl(&db, ws_id.clone()).await.unwrap();
        assert!(got.is_none(), "no change yet");

        {
            let conn = db.lock();
            let change = WorkspaceChange {
                change_id: 0,
                workspace_id: ws_id.clone(),
                run_id: None,
                diff_text: "diff --git a/x b/x\n".into(),
                files_added: 1,
                files_modified: 0,
                files_deleted: 0,
                captured_at: now_ms(),
            };
            workspace_changes::insert(&conn, &change).unwrap();
        }
        let got = get_workspace_diff_impl(&db, ws_id.clone()).await.unwrap();
        let c = got.expect("Some(change) after insert");
        assert_eq!(c.workspace_id, ws_id);
    }

    // -------------------------------------------------------------------
    // 12. discard_workspace_changes — unhappy path: no checkpoint
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn discard_workspace_changes_no_prior_run_returns_validation() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/dwc");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        // No AgentRun rows → expect Validation.
        let err = discard_workspace_changes_impl(&db, ws_id)
            .await
            .expect_err("must error with no checkpoint");
        match err {
            AppError::Validation(msg) => assert!(
                msg.contains("no checkpoint to discard to"),
                "unexpected message: {msg}"
            ),
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    // -------------------------------------------------------------------
    // 13. check_claude_install — must not panic, returns a known variant
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn check_claude_install_returns_some_variant() {
        let got = check_claude_install().await;
        assert!(
            matches!(got, ClaudeInstall::Installed { .. } | ClaudeInstall::Missing),
            "check_claude_install must return one of the two variants"
        );
    }

    // -------------------------------------------------------------------
    // 14. AgentRunTerminated emission — Q2 audit lock
    //
    // The Tauri command wraps this closure with `tauri_specta::Event::emit`,
    // but the `_impl` surface is generic over `Fn(AgentRunTerminated)`, so
    // these tests capture emissions into a Mutex-protected Vec without
    // booting a Tauri runtime.
    // -------------------------------------------------------------------

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_emits_terminated_on_done() {
        if !sandbox::git_available() {
            eprintln!(
                "SKIP start_agent_run_emits_terminated_on_done: git not on PATH"
            );
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-emit-done");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
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
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
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
            ws.workspace_id
        };

        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var(
            "MOZART_MOCK_FIXTURE",
            fixtures.join("streams/happy-text.jsonl"),
        );
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        // Shared capture buffer. The closure is Fn + Send + Sync + 'static
        // because the supervisor task moves it across the .spawn boundary.
        let captured: std::sync::Arc<std::sync::Mutex<Vec<AgentRunTerminated>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured_for_closure = captured.clone();

        let registry = RunRegistry::new();
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            "do".into(),
            noop_channel(),
            move |ev| {
                if let Ok(mut g) = captured_for_closure.lock() {
                    g.push(ev);
                }
            },
        )
        .await
        .expect("start_agent_run_impl ok");

        // The supervisor task runs detached; give it time to reach
        // `mark_ended` + `emit_terminated`. The happy-text fixture
        // typically completes in well under 500ms.
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

        let snapshot = captured.lock().unwrap().clone();
        assert!(
            !snapshot.is_empty(),
            "expected at least one AgentRunTerminated emission, got none"
        );
        let matching: Vec<_> = snapshot
            .iter()
            .filter(|e| e.run_id == run.run_id && e.status == "done")
            .collect();
        assert!(
            !matching.is_empty(),
            "expected an emission with status='done' for this run_id, got {snapshot:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_emits_terminated_on_stop() {
        if !sandbox::git_available() {
            eprintln!(
                "SKIP start_agent_run_emits_terminated_on_stop: git not on PATH"
            );
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Use sleep 2 (not 10) so even if SIGKILL leaves an orphaned
        // `sleep` child whose pipes outlive the parent shell — blocking
        // the supervisor's drain tasks on EOF — the test still completes
        // in a few seconds rather than the full 10s the runner-level
        // integration_cancel_mid_stream test budgets for.
        let dir = tempfile::tempdir().unwrap();
        let slow = dir.path().join("slow.sh");
        std::fs::write(
            &slow,
            "#!/bin/sh\nsleep 2\necho should-not-appear\n",
        )
        .unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&slow).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&slow, p).unwrap();
        }

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-emit-stop");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
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
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
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
            ws.workspace_id
        };

        // Route through mock-claude.sh so the slow fixture is `exec`ed
        // by sh — SIGKILL then targets the actual `sleep` process. If
        // we point MOZART_CLAUDE_BIN at slow.sh directly, the shell
        // spawns sleep as a separate child whose pipes outlive the
        // SIGKILL'd shell, hanging the drain tasks for the full 10s.
        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var("MOZART_MOCK_FIXTURE", &slow);
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let captured: std::sync::Arc<std::sync::Mutex<Vec<AgentRunTerminated>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured_for_closure = captured.clone();

        let registry = RunRegistry::new();
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            "do".into(),
            noop_channel(),
            move |ev| {
                if let Ok(mut g) = captured_for_closure.lock() {
                    g.push(ev);
                }
            },
        )
        .await
        .expect("start_agent_run_impl ok");

        // Let the child start, then cancel it.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        stop_agent_run_impl(&registry, run.run_id.clone())
            .await
            .expect("known run cancels");

        // Allow the supervisor to drain + mark_ended + emit_terminated.
        // Poll the capture buffer up to 8s rather than hard-sleeping a
        // flat amount — SIGKILL on the wrapper shell may leave an
        // orphaned `sleep` child whose pipes outlive the parent shell,
        // forcing the drain tasks to wait for the orphan to die before
        // they see EOF. With a `sleep 2` fixture this resolves in ~2-4s.
        let stopped_seen = {
            let mut found = false;
            for _ in 0..80 {
                tokio::time::sleep(std::time::Duration::from_millis(100))
                    .await;
                let snapshot = captured.lock().unwrap().clone();
                if snapshot
                    .iter()
                    .any(|e| e.run_id == run.run_id && e.status == "stopped")
                {
                    found = true;
                    break;
                }
            }
            found
        };
        let snapshot = captured.lock().unwrap().clone();
        // Helpful diagnostic if emit never fires: did the supervisor at
        // least reach mark_ended?
        let db_status = agent_runs::get(&db.lock(), &run.run_id)
            .map(|r| r.status)
            .unwrap_or_else(|_| "<row not found>".into());
        assert!(
            stopped_seen,
            "expected an emission with status='stopped' after cancel within 5s. \
             DB row status='{db_status}', captured={snapshot:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }
}
