//! High-level orchestrator that turns a user task + a base branch into a
//! fully-wired workspace: a `tasks` row, a `workspaces` row, a git worktree
//! on disk, and a 1:1 `threads` row. Owns the rollback ladder (D1.6-L)
//! so partial failures never leave the DB ahead of disk (or vice versa).
//!
//! The ladder, per plan §6 (Step 1.6):
//! 1. `validate_repo` — refuse up front via `AppError::Validation`.
//! 2. Insert `tasks` row.
//! 3. Insert `workspaces` row in `initializing` state with placeholder
//!    `worktree_path` / `branch_name`.
//! 4. `worktree::create` on disk — on failure, flip `deletion_intent=1`
//!    and bubble up.
//! 5. Persist real `branch_name` + `worktree_path` — on failure, remove
//!    the worktree from disk, flip `deletion_intent=1`, bubble up.
//! 6. Insert `threads` row — same rollback as step 5 on failure.
//! 7. Flip status to `ready` — same rollback as step 5 on failure.
//!
//! No use of the `tracing` crate by design: Mozart routes app logs
//! through the `log` facade so the tauri logger plugin captures them.

use std::path::Path;

use crate::db::models::{Task, Thread, Workspace};
use crate::db::{new_id, now_ms, tasks, threads, workspaces, DbState};
use crate::error::AppError;
use crate::git_query::validate_repo;
use crate::worktree;

/// Create a fully-wired workspace (Task + Workspace + worktree on disk +
/// Thread). Either returns `Ok(Workspace { status: "ready", .. })` with
/// every side-effect committed, or returns `Err(_)` after rolling back
/// (marking the `workspaces` row `deletion_intent=1` and removing the
/// worktree directory if it was created).
///
/// `workspace_name` is the friendly name surfaced to the user (e.g. a
/// singer-pool entry like `eminem`). It feeds both the persisted
/// `workspaces.name` column and the branch derivation
/// (`mozart/<slug-of-name>` via `branch_name::make_task_branch`).
pub async fn create_workspace(
    db: &DbState,
    repo_id: &str,
    repo_path: &Path,
    base_branch: &str,
    task_text: &str,
    workspace_name: &str,
) -> Result<Workspace, AppError> {
    // Step 1 — refuse early.
    validate_repo(repo_path)
        .await
        .map_err(|issue| AppError::Validation(format!("repo not usable: {issue:?}")))?;

    let task_id = new_id();
    let workspace_id = new_id();
    // Title = first line of `task_text`, capped at 80 chars. The full
    // `task_text` is preserved separately on the Task row so the body
    // survives this trim.
    let title = task_text
        .lines()
        .next()
        .unwrap_or("untitled")
        .chars()
        .take(80)
        .collect::<String>();
    let now = now_ms();

    // Step 2 — tasks row.
    let task = Task {
        task_id: task_id.clone(),
        repo_id: repo_id.into(),
        title,
        task_text: task_text.into(),
        status: "active".into(),
        created_at: now,
    };
    {
        let conn = db.lock();
        tasks::create(&conn, &task)?;
    }

    // Step 3 — workspaces row in `initializing` with empty placeholders.
    let mut ws = Workspace {
        workspace_id: workspace_id.clone(),
        task_id: task_id.clone(),
        name: workspace_name.into(),
        worktree_path: String::new(),
        branch_name: String::new(),
        base_branch: base_branch.into(),
        status: "initializing".into(),
        pinned: false,
        unread: false,
        created_at: now,
        deletion_intent: 0,
            ui_status: "backlog".into(),
    };
    {
        let conn = db.lock();
        workspaces::create(&conn, &ws)?;
    }

    // Step 4 — git worktree on disk.
    let handle = match worktree::create(repo_path, base_branch, &workspace_id, workspace_name).await {
        Ok(h) => h,
        Err(e) => {
            let conn = db.lock();
            let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
            return Err(e);
        }
    };
    ws.worktree_path = handle.worktree_path.to_string_lossy().into_owned();
    ws.branch_name = handle.branch_name.clone();

    // Step 5 — persist real path + branch name.
    if let Err(e) = (|| -> Result<(), AppError> {
        let conn = db.lock();
        workspaces::update_branch_name(&conn, &workspace_id, &ws.branch_name)?;
        workspaces::update_worktree_path(&conn, &workspace_id, &ws.worktree_path)?;
        Ok(())
    })() {
        let _ = worktree::remove(repo_path, &workspace_id).await;
        let conn = db.lock();
        let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
        return Err(e);
    }

    // Step 6 — thread row.
    let thread = Thread {
        thread_id: new_id(),
        workspace_id: workspace_id.clone(),
        created_at: now,
    };
    if let Err(e) = {
        let conn = db.lock();
        threads::create(&conn, &thread)
    } {
        let _ = worktree::remove(repo_path, &workspace_id).await;
        let conn = db.lock();
        let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
        return Err(e);
    }

    // Step 7 — flip to `ready`.
    let status_res = {
        let conn = db.lock();
        workspaces::update_status(&conn, &workspace_id, "ready")
    };
    if let Err(e) = status_res {
        let _ = worktree::remove(repo_path, &workspace_id).await;
        let conn = db.lock();
        let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
        return Err(e);
    }
    ws.status = "ready".into();
    Ok(ws)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::Repo;
    use crate::db::{init_db_memory, repos};
    use crate::sandbox::{git_available, test_env_gate};
    use std::path::Path;
    use std::process::Command;

    /// Build a tempdir-backed git repo with identity + one seed commit on
    /// `main`. Mirrors helpers in `worktree.rs::tests`.
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

    fn seed_repo_row(db: &DbState) -> String {
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
        r.repo_id
    }

    // D1.5-L: env-gate Mutex is intentionally held across awaits.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_workspace_happy_path() {
        if !git_available() {
            eprintln!("SKIP create_workspace_happy_path: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db);

        let ws = create_workspace(&db, &repo_id, &repo, "main", "Add OAuth\nfull body", "eminem")
            .await
            .expect("create_workspace ok");

        assert_eq!(ws.status, "ready");
        // Workspace name persisted on the row.
        assert_eq!(ws.name, "eminem");
        // Branch derived from the workspace name via make_task_branch.
        assert_eq!(ws.branch_name, "mozart/eminem");
        assert!(!ws.worktree_path.is_empty(), "worktree_path must be set");
        // pinned/unread default to 0.
        assert_eq!(ws.pinned, false);
        assert_eq!(ws.unread, false);

        // Task row: title trimmed to first line, full text preserved.
        let conn = db.lock();
        let task = tasks::get(&conn, &ws.task_id).expect("task exists");
        assert_eq!(task.title, "Add OAuth");
        assert_eq!(task.task_text, "Add OAuth\nfull body");
        // Thread row exists for this workspace.
        let _thread = threads::get_by_workspace(&conn, &ws.workspace_id).expect("thread exists");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_workspace_validation_refuses_non_repo() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        // `repo` is a directory but NOT a git repo.
        let repo = root_dir.path().join("not-a-repo");
        std::fs::create_dir_all(&repo).unwrap();

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db);

        let err = create_workspace(&db, &repo_id, &repo, "main", "task body", "callas")
            .await
            .expect_err("non-repo must refuse");
        match err {
            AppError::Validation(msg) => {
                assert!(
                    msg.contains("repo not usable"),
                    "expected 'repo not usable' prefix, got: {msg}"
                );
            }
            other => panic!("expected AppError::Validation, got {other:?}"),
        }

        // No tasks / workspaces rows must have been created.
        let conn = db.lock();
        let task_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(task_count, 0, "no tasks row may leak on validation refuse");
        let ws_rows = workspaces::list_all(&conn).unwrap();
        assert!(ws_rows.is_empty(), "no workspaces row may leak");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_workspace_mid_step_rollback_on_bad_base_branch() {
        if !git_available() {
            eprintln!("SKIP create_workspace_mid_step_rollback_on_bad_base_branch: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");
        std::env::set_var("LC_ALL", "C");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db);

        let err = create_workspace(
            &db,
            &repo_id,
            &repo,
            "nope-this-branch-does-not-exist",
            "task body",
            "sinatra",
        )
        .await
        .expect_err("bad base must fail");
        // Any error variant is acceptable per the atom; we just need Err(_).
        let _ = err;

        // Exactly one workspaces row, deletion_intent=1, status still "initializing".
        let conn = db.lock();
        let ws_rows = workspaces::list_all(&conn).unwrap();
        assert_eq!(ws_rows.len(), 1, "expected exactly one workspaces row");
        let ws = &ws_rows[0];
        assert_eq!(ws.deletion_intent, 1, "deletion_intent must be flipped");
        assert_eq!(ws.status, "initializing", "status must remain 'initializing'");

        // No thread for that workspace.
        let thread_err = threads::get_by_workspace(&conn, &ws.workspace_id).unwrap_err();
        assert!(
            matches!(thread_err, AppError::NotFound(_)),
            "expected NotFound for missing thread, got {thread_err:?}"
        );

        restore_root(prev);
    }
}
