//! Worktree lifecycle — `create`, `remove`, `cleanup_orphans` (Step 1.6).
//!
//! Each agent workspace gets its own `git worktree` rooted under the
//! canonical workspaces root (`MOZART_WORKTREES_ROOT` in tests / dev, the
//! OS-standard data dir otherwise — resolved by
//! `crate::paths::workspaces_root`).
//!
//! Locked decisions (plan §4 — Step 1.6):
//! - **D1.6-H** — `create` derives the branch via
//!   `branch_name::make_task_branch(workspace_name, short_id)`, then
//!   collapses to a single
//!   `git worktree add -b <branch> <path> <base_branch>` call through
//!   `sandbox::run_git` so error mapping stays in one place. Falls back
//!   to `make_initial_branch` if the name slug is rejected by
//!   `git check-ref-format`.
//! - **Atom 5** — the on-disk path is now
//!   `<root>/<project-slug>/<workspace-slug>` instead of the legacy
//!   `<root>/<workspace_id>` UUID layout. Project slug is derived from
//!   `repos.display_name` (not globally unique — two repos may share
//!   it); workspace slug from `workspaces.name` (unique per project).
//!   If either slug is empty after `slugify`, falls back to the
//!   8-char `workspace_id` prefix for that segment. If the final
//!   `<project-slug>/<workspace-slug>` directory already exists on
//!   disk (rare — stale cleanup, project-slug collision across repos),
//!   the workspace segment is suffixed `-2`, `-3`, … until free.
//!   Legacy UUID directories from before this atom continue to work
//!   because the DB-recorded `worktree_path` is the source of truth.
//! - **D1.6-I** — `remove` is best-effort + idempotent: it tries
//!   `git worktree remove --force` first (swallowing any error), then
//!   falls back to `remove_dir_all` if the directory still exists.
//!   Now takes the actual `worktree_path` so it works for both new
//!   nested paths and legacy UUID paths.
//! - **D1.6-F** — `cleanup_orphans` reconciles disk against the
//!   `workspaces` table: any worktree directory under the canonical
//!   root that isn't referenced by a DB row's `worktree_path` is
//!   removed. Empty project subdirectories left behind are pruned in
//!   the same pass. Used at startup so crashed prior runs don't leak.
//!
//! No use of the `tracing` crate here by design — Mozart's app-side
//! logging uses the `log` facade so the tauri logger plugin captures it.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::branch_name::{branch_exists, make_task_branch, slugify};
use crate::db::DbState;
use crate::error::AppError;
use crate::paths::workspaces_root;
use crate::sandbox::run_git;

/// Handle returned by `create` carrying the three values higher layers
/// (workspace_service, DB row construction) need to persist a workspace.
#[derive(Debug, Clone)]
pub struct WorktreeHandle {
    pub workspace_id: String,
    pub worktree_path: PathBuf,
    pub branch_name: String,
}

/// Create a new git worktree for `workspace_id` branching from
/// `base_branch`. Path is `<root>/<project-slug>/<workspace-slug>`;
/// branch is `mozart/<slug-of-workspace_name>`. Both slugs fall back
/// to the 8-char workspace_id prefix when slugify yields empty.
///
/// Collisions get a unified `-N` suffix on BOTH the path's workspace
/// segment AND the branch name (atom 6). The same N is used for both
/// so they stay aligned. A candidate `(path, branch)` is considered
/// taken if ANY of:
///   - the path exists on disk
///   - a `mozart/...` branch with that name already exists in the repo
///   - any DB row in `workspaces` already records that `worktree_path`
///     (including archived rows where `deletion_intent=1`, since the
///     SQL UNIQUE constraint applies to them too) — atom 7.
pub async fn create(
    db: &DbState,
    repo_path: &Path,
    base_branch: &str,
    workspace_id: &str,
    workspace_name: &str,
    project_name: &str,
) -> Result<WorktreeHandle, AppError> {
    if base_branch.is_empty() {
        return Err(AppError::Validation("base_branch is empty".into()));
    }
    let short = &workspace_id[..8.min(workspace_id.len())];
    let base_branch_candidate = make_task_branch(workspace_name, short).await;

    let root = workspaces_root()?;
    let project_seg = path_segment(project_name, short);
    let workspace_seg = path_segment(workspace_name, short);
    let project_dir = root.join(&project_seg);
    let db_paths: HashSet<PathBuf> = {
        let conn = db.lock();
        crate::db::workspaces::list_all(&conn)?
            .into_iter()
            .map(|w| PathBuf::from(w.worktree_path))
            .collect()
    };
    let (path, branch) = resolve_free_handle(
        repo_path,
        &project_dir,
        &workspace_seg,
        &base_branch_candidate,
        &db_paths,
    )
    .await?;

    std::fs::create_dir_all(&project_dir)
        .map_err(|e| AppError::Io(format!("mkdir project dir {project_dir:?}: {e}")))?;
    let path_str = path.to_string_lossy().into_owned();
    let start_point = resolve_start_point(repo_path, base_branch).await;
    run_git(
        repo_path,
        &["worktree", "add", "-b", &branch, &path_str, &start_point],
    )
    .await?;
    Ok(WorktreeHandle {
        workspace_id: workspace_id.to_string(),
        worktree_path: path,
        branch_name: branch,
    })
}

/// Resolve the start point `git worktree add -b <branch> <path> <start>` forks
/// from. A local head is used as-is. A branch that exists only as
/// `origin/<base>` (e.g. a clone's `develop`) resolves to that explicit remote
/// ref — passing the bare name would trip git's DWIM and create a local `<base>`
/// branch instead of the intended `-b` branch. Falls back to the bare name
/// (git surfaces the "invalid reference" error) when neither exists.
async fn resolve_start_point(repo_path: &Path, base_branch: &str) -> String {
    if ref_exists(repo_path, &format!("refs/heads/{base_branch}")).await {
        return base_branch.to_string();
    }
    if ref_exists(repo_path, &format!("refs/remotes/origin/{base_branch}")).await {
        return format!("origin/{base_branch}");
    }
    base_branch.to_string()
}

async fn ref_exists(repo_path: &Path, fullref: &str) -> bool {
    run_git(repo_path, &["show-ref", "--verify", "--quiet", fullref])
        .await
        .is_ok()
}

/// Filesystem segment from a free-form name. Falls back to `short_id`
/// when slugify yields empty (all-special-character names).
fn path_segment(name: &str, short_id: &str) -> String {
    let slug = slugify(name);
    if slug.is_empty() {
        short_id.to_string()
    } else {
        slug
    }
}

/// Smallest unified `-N` (with `N==1` meaning no suffix) where both
/// the candidate worktree dir AND the candidate branch are free.
/// Returns `(path, branch)` ready to feed `git worktree add -b`.
/// Caps at 100 to avoid pathological loops.
async fn resolve_free_handle(
    repo_path: &Path,
    project_dir: &Path,
    workspace_seg: &str,
    base_branch: &str,
    db_paths: &HashSet<PathBuf>,
) -> Result<(PathBuf, String), AppError> {
    for n in 1..=100 {
        let (ws_seg, branch) = if n == 1 {
            (workspace_seg.to_string(), base_branch.to_string())
        } else {
            (
                format!("{workspace_seg}-{n}"),
                format!("{base_branch}-{n}"),
            )
        };
        let candidate_path = project_dir.join(&ws_seg);
        if candidate_path.exists() {
            continue;
        }
        if db_paths.contains(&candidate_path) {
            continue;
        }
        if branch_exists(repo_path, &branch).await {
            continue;
        }
        return Ok((candidate_path, branch));
    }
    Err(AppError::Io(format!(
        "worktree collision under {}: 100 suffixes tried",
        project_dir.display()
    )))
}

/// Remove the worktree at `worktree_path`. Idempotent: missing
/// directory → `Ok(())`. Falls back to `remove_dir_all` if git refuses
/// (e.g. the worktree was never registered).
pub async fn remove(repo_path: &Path, worktree_path: &Path) -> Result<(), AppError> {
    let path_str = worktree_path.to_string_lossy().into_owned();
    let _ = run_git(repo_path, &["worktree", "remove", "--force", &path_str]).await;
    if worktree_path.exists() {
        std::fs::remove_dir_all(worktree_path)
            .map_err(|e| AppError::Io(format!("rm -rf {}: {e}", worktree_path.display())))?;
    }
    Ok(())
}

/// Delete the Mozart-managed git branch in `repo_path`.
/// Only acts on `mozart/`-prefixed branches — any other name is a no-op so
/// legacy or externally-created branches are never touched.
/// Idempotent: branch already gone → `Ok(())`.
/// Uses `git branch -D` (force) because `remove` has already unregistered
/// the worktree; `-d` would reject branches with unmerged commits for no reason.
pub async fn delete_branch(repo_path: &Path, branch_name: &str) -> Result<(), AppError> {
    if !branch_name.starts_with("mozart/") {
        return Ok(());
    }
    match run_git(repo_path, &["branch", "-D", branch_name]).await {
        Ok(_) => Ok(()),
        Err(AppError::GitCmd(msg)) if msg.contains("not found") => Ok(()),
        Err(e) => Err(e),
    }
}

/// Remove every worktree directory under the canonical root that
/// isn't referenced by any row in the `workspaces` table. Walks two
/// levels deep to handle the nested `<project>/<workspace>` layout
/// AND the legacy flat `<workspace_id>` layout in one pass. Empty
/// project subdirectories left over are pruned. Returns the count of
/// successful removals.
pub async fn cleanup_orphans(db: &DbState) -> Result<usize, AppError> {
    let root = workspaces_root()?;
    let known: HashSet<PathBuf> = {
        let conn = db.lock();
        crate::db::workspaces::list_all(&conn)?
            .into_iter()
            .map(|w| PathBuf::from(w.worktree_path))
            .collect()
    };

    let mut removed = 0usize;
    let Ok(read) = std::fs::read_dir(&root) else {
        return Ok(0);
    };
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Direct DB match (legacy UUID layout, or a single-level path) — keep.
        if known.contains(&path) {
            continue;
        }
        // Maybe a new-layout project subdir — recurse one level and
        // keep / remove children individually.
        let mut kept_a_child = false;
        if let Ok(child_read) = std::fs::read_dir(&path) {
            for child in child_read.flatten() {
                let child_path = child.path();
                if !child_path.is_dir() {
                    kept_a_child = true;
                    continue;
                }
                if known.contains(&child_path) {
                    kept_a_child = true;
                } else if std::fs::remove_dir_all(&child_path).is_ok() {
                    removed += 1;
                }
            }
        }
        // After child cleanup, drop empty project dir; otherwise it's
        // a legacy UUID-named worktree we don't know about → remove.
        if !kept_a_child {
            if std::fs::remove_dir_all(&path).is_ok() {
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
        let db = init_db_memory().unwrap();

        let workspace_id = "abcdef1234567890";
        let handle = create(&db, &repo, "main", workspace_id, "eminem", "Mozart App")
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
        // Friendly name "eminem" yields `mozart/eminem` via make_task_branch.
        assert_eq!(handle.branch_name, "mozart/eminem");
        // Path is `<root>/<project-slug>/<workspace-slug>`.
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("mozart-app").join("eminem")
        );

        restore_root(prev);
    }

    // Empty workspace_name slug falls back to the deterministic wip branch.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_falls_back_to_wip_when_name_slug_empty() {
        if !git_available() {
            eprintln!("SKIP create_falls_back_to_wip_when_name_slug_empty: git not on PATH");
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

        let workspace_id = "fbacdef123456789";
        // All-special-character name slugs to empty; falls back to wip
        // for both the branch AND the workspace path segment.
        let handle = create(&db, &repo, "main", workspace_id, "!!! @@@ ###", "Mozart App")
            .await
            .expect("create ok");
        assert_eq!(handle.branch_name, "mozart/wip-fbacdef1");
        // Workspace path segment falls back to the 8-char workspace_id.
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("mozart-app").join("fbacdef1")
        );

        restore_root(prev);
    }

    // Project slug empty → falls back to short workspace_id for the
    // project segment too.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_falls_back_when_project_slug_empty() {
        if !git_available() {
            eprintln!("SKIP create_falls_back_when_project_slug_empty: git not on PATH");
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

        let workspace_id = "noproj12abcdef34";
        let handle = create(&db, &repo, "main", workspace_id, "callas", "!!!")
            .await
            .expect("create ok");
        // Both segments fall back to short id when project slug is empty.
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("noproj12").join("callas")
        );

        restore_root(prev);
    }

    // A lingering branch from a previously-archived workspace (whose
    // dir was removed but branch was kept) must be skipped, with the
    // new workspace taking `-2` on BOTH the path and the branch.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_suffixes_on_branch_collision() {
        if !git_available() {
            eprintln!("SKIP create_suffixes_on_branch_collision: git not on PATH");
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

        // Pre-seed a branch `mozart/dylan` so it lingers without a
        // worktree dir (the user's actual reproduction).
        let s = Command::new("git")
            .current_dir(&repo)
            .args(["branch", "mozart/dylan"])
            .output()
            .expect("git branch");
        assert!(s.status.success(), "pre-seed branch failed: {:?}", s);

        let handle = create(&db, &repo, "main", "dyl1234abcdef000", "dylan", "Mozart App")
            .await
            .expect("create ok");
        assert_eq!(
            handle.branch_name, "mozart/dylan-2",
            "branch must be suffixed when bare name is taken"
        );
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("mozart-app").join("dylan-2"),
            "path must use the same suffix as the branch"
        );

        restore_root(prev);
    }

    // A DB row already holding the candidate path — typically an
    // archived workspace (deletion_intent=1) whose dir+branch were
    // removed manually but whose row was kept — must be skipped so
    // the SQL UNIQUE on `workspaces.worktree_path` doesn't blow up
    // the subsequent INSERT.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_suffixes_on_db_path_collision() {
        if !git_available() {
            eprintln!("SKIP create_suffixes_on_db_path_collision: git not on PATH");
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
        // Seed an archived workspace row whose worktree_path is the
        // bare candidate — no dir on disk, no branch in git.
        let bare_path = root_dir.path().join("mozart-app").join("dylan");
        {
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
                setup_command: None,
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
            let archived = Workspace {
                workspace_id: "archived-dylan".into(),
                task_id: t.task_id,
                name: "dylan".into(),
                worktree_path: bare_path.to_string_lossy().into_owned(),
                branch_name: "mozart/archived".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 1, // archived
                ui_status: "backlog".into(),
                last_merge_action: None,
                sandbox_level: "L2Project".into(),
                pr_url: None,
                pr_number: None,
                pr_state: None,
            };
            workspaces::create(&conn, &archived).unwrap();
        }

        let handle = create(&db, &repo, "main", "newd123abcdef000", "dylan", "Mozart App")
            .await
            .expect("create ok despite archived DB row");
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("mozart-app").join("dylan-2"),
            "must skip the archived DB-held path"
        );

        restore_root(prev);
    }

    // A pre-existing directory at the candidate path (e.g. a stale
    // worktree that cleanup_orphans hasn't run on yet, or a slug
    // collision across two repos that happen to share `display_name`)
    // forces a `-2` suffix on the workspace segment so worktree::create
    // never overwrites an existing dir.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_suffixes_on_dir_collision() {
        if !git_available() {
            eprintln!("SKIP create_suffixes_on_dir_collision: git not on PATH");
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

        // Pre-seed the candidate path with a non-worktree dir; create
        // must route around it rather than fail or overwrite.
        let occupied = root_dir.path().join("mozart-app").join("eminem");
        std::fs::create_dir_all(&occupied).unwrap();

        let handle = create(&db, &repo, "main", "first123abcdef00", "eminem", "Mozart App")
            .await
            .expect("create ok");
        assert_eq!(
            handle.worktree_path,
            root_dir.path().join("mozart-app").join("eminem-2"),
            "second candidate must suffix -2"
        );
        assert!(occupied.exists(), "the pre-seeded dir must remain untouched");

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
        let db = init_db_memory().unwrap();

        let err = create(&db, &repo, "", "ws-empty-base", "eminem", "Mozart App")
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
        let db = init_db_memory().unwrap();

        let err = create(
            &db,
            &repo,
            "nope-this-branch-does-not-exist",
            "ws-bad-base",
            "eminem",
            "Mozart App",
        )
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
        let db = init_db_memory().unwrap();

        let workspace_id = "rm-1234567890ab";
        let handle = create(&db, &repo, "main", workspace_id, "callas", "Mozart App")
            .await
            .expect("create ok");
        assert!(handle.worktree_path.exists());

        remove(&repo, &handle.worktree_path).await.expect("remove ok");
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
        let db = init_db_memory().unwrap();

        let workspace_id = "idem-1234567890";
        let handle = create(&db, &repo, "main", workspace_id, "sinatra", "Mozart App")
            .await
            .expect("create ok");
        remove(&repo, &handle.worktree_path)
            .await
            .expect("first remove ok");
        remove(&repo, &handle.worktree_path)
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
                icon: None,
                hidden: false,
                sort_index: 0,
                run_command: None,
                setup_command: None,
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
                name: "keep".into(),
                worktree_path: keep.to_string_lossy().into_owned(),
                branch_name: "agent/wip-keep-id".into(),
                base_branch: "main".into(),
                status: "initializing".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
        }

        let removed = cleanup_orphans(&db).await.expect("cleanup ok");
        assert_eq!(removed, 0, "no known dirs may be removed");
        assert!(keep.exists(), "known dir must still exist");

        restore_root(prev);
    }

    // New-layout nested dirs: cleanup keeps the workspace inside a
    // project subdir when it's in the DB, drops the orphan sibling,
    // and prunes a fully-empty orphan project dir in the same pass.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn cleanup_orphans_walks_nested_project_dirs() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());

        // Layout:
        //   <root>/mozart-app/eminem   (known — keep)
        //   <root>/mozart-app/callas   (orphan — remove)
        //   <root>/dead-project/anyws  (orphan — remove, parent then empty)
        //   <root>/legacy-uuid/        (legacy known — keep, but inside is also a known path)
        let keep_ws = root_dir.path().join("mozart-app").join("eminem");
        let orphan_sibling = root_dir.path().join("mozart-app").join("callas");
        let orphan_nested = root_dir.path().join("dead-project").join("anyws");
        let legacy_keep = root_dir.path().join("legacy-uuid");
        std::fs::create_dir_all(&keep_ws).unwrap();
        std::fs::create_dir_all(&orphan_sibling).unwrap();
        std::fs::create_dir_all(&orphan_nested).unwrap();
        std::fs::create_dir_all(&legacy_keep).unwrap();

        let db = init_db_memory().unwrap();
        {
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
                setup_command: None,
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
            for (id, path) in [
                ("ws-eminem", keep_ws.clone()),
                ("legacy-uuid", legacy_keep.clone()),
            ] {
                let ws = Workspace {
                    workspace_id: id.into(),
                    task_id: t.task_id.clone(),
                    name: id.into(),
                    worktree_path: path.to_string_lossy().into_owned(),
                    branch_name: format!("mozart/{id}"),
                    base_branch: "main".into(),
                    status: "ready".into(),
                    pinned: false,
                    unread: false,
                    created_at: now_ms(),
                    deletion_intent: 0,
                    ui_status: "backlog".into(),
                    last_merge_action: None,
                    sandbox_level: "L2Project".into(),
                    pr_url: None,
                    pr_number: None,
                    pr_state: None,
                };
                workspaces::create(&conn, &ws).unwrap();
            }
        }

        let removed = cleanup_orphans(&db).await.expect("cleanup ok");
        // callas (orphan sibling) + dead-project/anyws + dead-project parent = 3.
        assert_eq!(removed, 3, "expected 3 removals, got {removed}");
        assert!(keep_ws.exists(), "known workspace must survive");
        assert!(legacy_keep.exists(), "legacy known workspace must survive");
        assert!(!orphan_sibling.exists(), "orphan sibling must be gone");
        assert!(!orphan_nested.exists(), "orphan nested must be gone");
        assert!(
            !root_dir.path().join("dead-project").exists(),
            "empty orphan project dir must be pruned"
        );
        // The known project parent stays because one child was kept.
        assert!(
            root_dir.path().join("mozart-app").exists(),
            "project dir with surviving children must remain"
        );

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn delete_branch_happy_path() {
        if !git_available() {
            eprintln!("SKIP delete_branch_happy_path: git not on PATH");
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

        // Create a real worktree so the branch exists, then remove the
        // worktree dir — simulating the archive_workspace sequence.
        let handle = create(&db, &repo, "main", "del1234abcdef00", "callas", "Mozart App")
            .await
            .expect("create ok");
        assert_eq!(handle.branch_name, "mozart/callas");
        remove(&repo, &handle.worktree_path).await.expect("remove ok");

        // Branch still exists after the worktree dir is gone.
        assert!(
            branch_exists(&repo, "mozart/callas").await,
            "precondition: branch must still exist after worktree dir removal"
        );

        delete_branch(&repo, &handle.branch_name)
            .await
            .expect("delete_branch ok");

        assert!(
            !branch_exists(&repo, "mozart/callas").await,
            "branch must be gone after delete_branch"
        );

        restore_root(prev);
    }

    #[tokio::test]
    async fn delete_branch_is_idempotent() {
        if !git_available() {
            eprintln!("SKIP delete_branch_is_idempotent: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        init_repo_with_main(tmp.path());

        // Branch does not exist — must return Ok, not an error.
        delete_branch(tmp.path(), "mozart/nonexistent")
            .await
            .expect("delete of nonexistent branch must be Ok");
    }

    #[tokio::test]
    async fn delete_branch_ignores_non_mozart_prefix() {
        if !git_available() {
            eprintln!("SKIP delete_branch_ignores_non_mozart_prefix: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        init_repo_with_main(tmp.path());

        // Create a non-mozart branch and verify delete_branch leaves it alone.
        let s = Command::new("git")
            .current_dir(tmp.path())
            .args(["branch", "feature/keep-me"])
            .output()
            .expect("git branch");
        assert!(s.status.success(), "pre-seed branch failed");

        delete_branch(tmp.path(), "feature/keep-me")
            .await
            .expect("Ok for non-mozart prefix");

        // Branch must still exist — prefix guard skipped the delete.
        assert!(
            branch_exists(tmp.path(), "feature/keep-me").await,
            "non-mozart branch must not be deleted"
        );
    }
}
