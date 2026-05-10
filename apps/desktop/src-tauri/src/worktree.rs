//! Worktree lifecycle — `create`, `remove`, `cleanup_orphans` (Step 1.6).
//!
//! Each agent workspace gets its own `git worktree` rooted under the
//! canonical worktrees root (`MOZART_WORKTREES_ROOT` in tests / dev,
//! `$HOME/.mozart/worktrees` otherwise — resolved by
//! `crate::sandbox::canonical_worktrees_root`).
//!
//! Locked decisions (plan §4 — Step 1.6):
//! - **D1.6-H** — `create` derives the placeholder branch via
//!   `branch_name::make_initial_branch(short_id)` where `short_id` is the
//!   first 8 chars of `workspace_id`, then collapses to a single
//!   `git worktree add -b <branch> <path> <base_branch>` call through
//!   `sandbox::run_git` so error mapping stays in one place.
//! - **D1.6-I** — `remove` is best-effort + idempotent: it tries
//!   `git worktree remove --force` first (swallowing any error), then
//!   falls back to `remove_dir_all` if the directory still exists. A
//!   second call on an already-removed workspace returns `Ok(())`.
//! - **D1.6-F** — `cleanup_orphans` reconciles disk against the
//!   `workspaces` table: any directory directly under the canonical root
//!   whose name isn't a known `workspace_id` is removed. Used at startup
//!   so crashed prior runs don't leak worktree directories.
//!
//! No use of the `tracing` crate here by design — Mozart's app-side
//! logging uses the `log` facade so the tauri logger plugin captures it.

use std::path::{Path, PathBuf};

use crate::branch_name::make_initial_branch;
use crate::db::DbState;
use crate::error::AppError;
use crate::sandbox::{canonical_worktrees_root, run_git};

/// Handle returned by `create` carrying the three values higher layers
/// (workspace_service, DB row construction) need to persist a workspace.
#[derive(Debug, Clone)]
pub struct WorktreeHandle {
    pub workspace_id: String,
    pub worktree_path: PathBuf,
    pub branch_name: String,
}

/// Create a new git worktree for `workspace_id` branching from
/// `base_branch` (D1.6-H). Path is `<canonical_worktrees_root>/<workspace_id>`;
/// branch is `agent/wip-<first-8-chars-of-workspace_id>`.
pub async fn create(
    repo_path: &Path,
    base_branch: &str,
    workspace_id: &str,
) -> Result<WorktreeHandle, AppError> {
    if base_branch.is_empty() {
        return Err(AppError::Validation("base_branch is empty".into()));
    }
    let short = &workspace_id[..8.min(workspace_id.len())];
    let branch = make_initial_branch(short);
    let path = canonical_worktrees_root()?.join(workspace_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("mkdir worktrees root: {e}")))?;
    }
    let path_str = path.to_string_lossy().into_owned();
    run_git(
        repo_path,
        &["worktree", "add", "-b", &branch, &path_str, base_branch],
    )
    .await?;
    Ok(WorktreeHandle {
        workspace_id: workspace_id.to_string(),
        worktree_path: path,
        branch_name: branch,
    })
}

/// Remove the worktree for `workspace_id` (D1.6-I). Idempotent: missing
/// directory → `Ok(())`. Falls back to `remove_dir_all` if git refuses
/// (e.g. the worktree was never registered).
pub async fn remove(repo_path: &Path, workspace_id: &str) -> Result<(), AppError> {
    let path = canonical_worktrees_root()?.join(workspace_id);
    let path_str = path.to_string_lossy().into_owned();
    let _ = run_git(repo_path, &["worktree", "remove", "--force", &path_str]).await;
    if path.exists() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| AppError::Io(format!("rm -rf {}: {e}", path.display())))?;
    }
    Ok(())
}

/// Remove every directory under the canonical worktrees root whose name
/// is not a known `workspace_id` (D1.6-F). Returns the count of
/// successful removals. Intended to be called at startup.
pub async fn cleanup_orphans(db: &DbState) -> Result<usize, AppError> {
    let root = canonical_worktrees_root()?;
    let known: std::collections::HashSet<String> = {
        let conn = db.lock();
        crate::db::workspaces::list_all(&conn)?
            .into_iter()
            .map(|w| w.workspace_id)
            .collect()
    };
    let mut removed = 0usize;
    if let Ok(read) = std::fs::read_dir(&root) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if known.contains(&name) {
                continue;
            }
            if entry.path().is_dir() && std::fs::remove_dir_all(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{Repo, Task, Workspace};
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};
    use crate::sandbox::{git_available, test_env_gate};
    use std::process::Command;

    /// Build a tempdir-backed git repo with identity + one seed commit on
    /// `main`. Mirrors helpers in `sandbox/reset.rs`.
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

    /// Restore prior `MOZART_WORKTREES_ROOT` value (or remove if it was
    /// unset). Mirrors the helper in `sandbox/reset.rs::tests`.
    fn restore_root(prev: Option<std::ffi::OsString>) {
        match prev {
            Some(v) => std::env::set_var("MOZART_WORKTREES_ROOT", v),
            None => std::env::remove_var("MOZART_WORKTREES_ROOT"),
        }
    }

    // D1.5-L: the env-gate Mutex is intentionally held across awaits.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_happy_path() {
        if !git_available() {
            eprintln!("SKIP create_happy_path: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let workspace_id = "abcdef1234567890";
        let handle = create(&repo, "main", workspace_id)
            .await
            .expect("create ok");

        assert_eq!(handle.workspace_id, workspace_id);
        assert!(handle.worktree_path.exists(), "worktree dir must exist");
        // `.git` inside a linked worktree is a *file* (gitfile pointer),
        // not a directory.
        let gitfile = handle.worktree_path.join(".git");
        assert!(gitfile.exists(), ".git pointer must exist in worktree");
        assert!(
            gitfile.is_file(),
            ".git inside a linked worktree must be a gitfile (file), got dir"
        );
        assert_eq!(handle.branch_name, "agent/wip-abcdef12");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_rejects_empty_base_branch() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");
        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());

        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();

        let err = create(&repo, "", "ws-empty-base")
            .await
            .expect_err("empty base_branch must reject");
        match err {
            AppError::Validation(msg) => {
                assert!(
                    msg.contains("base_branch is empty"),
                    "expected base_branch validation msg, got: {msg}"
                );
            }
            other => panic!("expected AppError::Validation, got {other:?}"),
        }

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_rejects_invalid_base_branch() {
        if !git_available() {
            eprintln!("SKIP create_rejects_invalid_base_branch: git not on PATH");
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

        let err = create(&repo, "nope-this-branch-does-not-exist", "ws-bad-base")
            .await
            .expect_err("invalid base must fail");
        match err {
            AppError::GitCmd(msg) => {
                let lower = msg.to_lowercase();
                assert!(
                    lower.contains("invalid reference")
                        || lower.contains("not a valid")
                        || lower.contains("unknown revision")
                        || lower.contains("bad object"),
                    "expected stderr to mention invalid/unknown ref, got: {msg}"
                );
            }
            other => panic!("expected AppError::GitCmd, got {other:?}"),
        }

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn remove_happy_path() {
        if !git_available() {
            eprintln!("SKIP remove_happy_path: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let workspace_id = "rm-1234567890ab";
        let handle = create(&repo, "main", workspace_id).await.expect("create ok");
        assert!(handle.worktree_path.exists());

        remove(&repo, workspace_id).await.expect("remove ok");
        assert!(
            !handle.worktree_path.exists(),
            "worktree dir must be gone after remove"
        );

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn remove_is_idempotent() {
        if !git_available() {
            eprintln!("SKIP remove_is_idempotent: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let workspace_id = "idem-1234567890";
        create(&repo, "main", workspace_id).await.expect("create ok");
        remove(&repo, workspace_id).await.expect("first remove ok");
        remove(&repo, workspace_id)
            .await
            .expect("second remove must also be Ok");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn cleanup_orphans_removes_disk_without_db() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let orphan = root_dir.path().join("orphan-id");
        std::fs::create_dir_all(&orphan).unwrap();

        let db = init_db_memory().unwrap();
        let removed = cleanup_orphans(&db).await.expect("cleanup ok");
        assert_eq!(removed, 1, "exactly one orphan dir must be removed");
        assert!(!orphan.exists(), "orphan dir must be gone");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn cleanup_orphans_preserves_known_dirs() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let keep = root_dir.path().join("keep-id");
        std::fs::create_dir_all(&keep).unwrap();

        // Seed FK parents (Repo → Task) then insert a workspace row
        // whose id matches the on-disk dir name.
        let db = init_db_memory().unwrap();
        {
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
            let ws = Workspace {
                workspace_id: "keep-id".into(),
                task_id: t.task_id,
                worktree_path: keep.to_string_lossy().into_owned(),
                branch_name: "agent/wip-keep-id".into(),
                base_branch: "main".into(),
                status: "initializing".into(),
                created_at: now_ms(),
                deletion_intent: 0,
            };
            workspaces::create(&conn, &ws).unwrap();
        }

        let removed = cleanup_orphans(&db).await.expect("cleanup ok");
        assert_eq!(removed, 0, "no known dirs may be removed");
        assert!(keep.exists(), "known dir must still exist");

        restore_root(prev);
    }
}
