//! Local "Merge now" flow (plan §P2.6).
//!
//! Implements the six-step flow:
//!
//! 1. Dirty tree? → `AppError::MergeDirtyTree`
//! 2. Fetch origin (best-effort)
//! 3. Base ahead of origin? → `AppError::MergeBaseAhead(base_name)`
//! 4. Detach HEAD at base inside the workspace's own worktree
//! 5. `git merge --no-ff <workspace_branch>` — produces conflicts or
//!    a real merge commit
//! 6. On success: advance the base ref to the merge commit, switch the
//!    worktree back to the workspace branch, return `Done`. On conflict:
//!    leave the worktree mid-merge so the user can resolve in their IDE
//!    and return `Conflict { conflicting_files }`.
//!
//! The detached-HEAD pattern keeps everything inside one working tree —
//! git refuses to check out a branch that is already checked out
//! elsewhere, but a detached checkout of the same ref is allowed. This
//! means the user's project-root checkout (likely sitting on the base
//! branch in their primary IDE) is never touched.
//!
//! CG-2 (plan "Critical gaps") covers a separate concern: if the app
//! crashes mid-merge, `has_in_progress_merge` lets the boot path flip
//! `workspace.status = 'conflict'` so the same Resolve-in-IDE flow takes
//! over on the next launch.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::sandbox::{run_git, run_git_capture};

/// Terminal outcome of a `merge_workspace_locally` run.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MergeOutcome {
    /// `"done"` (merge committed, base ref advanced) or `"conflict"`
    /// (worktree left mid-merge for the user to resolve in their IDE).
    pub status: String,
    /// Repo-relative paths reported by `git diff --name-only
    /// --diff-filter=U`. Empty when `status == "done"`.
    pub conflicting_files: Vec<String>,
}

pub const STATUS_DONE: &str = "done";
pub const STATUS_CONFLICT: &str = "conflict";

pub async fn merge_workspace_locally(
    worktree: &Path,
    workspace_branch: &str,
    base_branch: &str,
) -> Result<MergeOutcome, AppError> {
    // Step 1 — refuse if the workspace has uncommitted changes.
    let porcelain = run_git(worktree, &["status", "--porcelain"]).await?;
    if !porcelain.trim().is_empty() {
        return Err(AppError::MergeDirtyTree(workspace_branch.into()));
    }

    // Steps 2 + 3 — best-effort fetch + base-ahead probe. Network /
    // remote errors are swallowed silently: a missing origin or an
    // offline machine should still let the user merge locally.
    let origin = run_git_capture(worktree, &["remote", "get-url", "origin"]).await?;
    if origin.status.success() {
        let _ = run_git(worktree, &["fetch", "origin", base_branch]).await;
        let probe = run_git_capture(
            worktree,
            &[
                "rev-list",
                "--count",
                &format!("{base_branch}..origin/{base_branch}"),
            ],
        )
        .await?;
        if probe.status.success() {
            let count: u64 = String::from_utf8_lossy(&probe.stdout)
                .trim()
                .parse()
                .unwrap_or(0);
            if count > 0 {
                return Err(AppError::MergeBaseAhead(base_branch.into()));
            }
        }
    }

    // Step 4 — detach HEAD at base inside the workspace worktree. Git
    // allows a detached checkout of a branch that is checked out in
    // another worktree (the user's primary clone); a non-detached
    // `switch <base>` would be refused.
    run_git(worktree, &["switch", "--detach", base_branch]).await?;

    // Step 5 — merge --no-ff. A non-zero exit usually means a conflict;
    // confirm via `--diff-filter=U` before classifying.
    let merge_msg = format!("Merge {workspace_branch} into {base_branch}");
    let merge_args: [&str; 5] = [
        "merge",
        "--no-ff",
        "-m",
        merge_msg.as_str(),
        workspace_branch,
    ];
    let merge_out = run_git_capture(worktree, &merge_args).await?;
    if !merge_out.status.success() {
        let conflict_probe =
            run_git_capture(worktree, &["diff", "--name-only", "--diff-filter=U"]).await?;
        let conflict_stdout = String::from_utf8_lossy(&conflict_probe.stdout);
        let files: Vec<String> = conflict_stdout
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if files.is_empty() {
            // Not a conflict — restore workspace branch and surface the
            // raw git error so we don't strand the worktree mid-merge.
            let _ = run_git(worktree, &["merge", "--abort"]).await;
            let _ = run_git(worktree, &["switch", workspace_branch]).await;
            return Err(AppError::GitCmd(format!(
                "git merge failed: {}",
                String::from_utf8_lossy(&merge_out.stderr).trim()
            )));
        }
        return Ok(MergeOutcome {
            status: STATUS_CONFLICT.into(),
            conflicting_files: files,
        });
    }

    // Step 6 — success. The merge commit is at HEAD; advance the base
    // ref to it, then restore the workspace branch in the worktree so
    // the user can keep browsing it as read-only.
    run_git(
        worktree,
        &["update-ref", &format!("refs/heads/{base_branch}"), "HEAD"],
    )
    .await?;
    run_git(worktree, &["switch", workspace_branch]).await?;

    Ok(MergeOutcome {
        status: STATUS_DONE.into(),
        conflicting_files: vec![],
    })
}

/// CG-2 — true when `<worktree>` has a `MERGE_HEAD`, meaning a previous
/// `git merge` did not finish (power loss, app crash, …). Boot code
/// uses this to flip `workspace.status` to `'conflict'` so the standard
/// "resolve in IDE" path takes over on the next launch.
pub async fn has_in_progress_merge(worktree: &Path) -> Result<bool, AppError> {
    let out = run_git_capture(
        worktree,
        &["rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
    )
    .await?;
    Ok(out.status.success())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::{git_available, test_env_gate};
    use std::path::PathBuf;
    use tempfile::TempDir;

    struct TestRepo {
        _tmp: TempDir,
        worktree: PathBuf,
        workspace_branch: String,
        base_branch: String,
    }

    async fn run(cwd: &Path, args: &[&str]) {
        let out = run_git_capture(cwd, args).await.expect("git spawn");
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    /// Build a primary repo + workspace worktree. The worktree starts
    /// on `agent/wip-x`, branched off `main`. Returns once the worktree
    /// is clean and ready for the merge flow.
    async fn make_repo(seed_diverging: bool) -> TestRepo {
        let tmp = tempfile::tempdir().expect("tempdir");
        let primary = tmp.path().join("primary");
        std::fs::create_dir_all(&primary).unwrap();
        run(&primary, &["init", "-q", "-b", "main"]).await;
        run(&primary, &["config", "user.email", "t@example.com"]).await;
        run(&primary, &["config", "user.name", "T"]).await;
        run(&primary, &["commit", "--allow-empty", "-m", "root"]).await;
        // Seed a file so `main` has something to diverge from.
        std::fs::write(primary.join("README.md"), "base\n").unwrap();
        run(&primary, &["add", "README.md"]).await;
        run(&primary, &["commit", "-m", "base file"]).await;

        // Workspace worktree on agent/wip-x.
        let wt = tmp.path().join("wt");
        run(
            &primary,
            &["worktree", "add", "-b", "agent/wip-x", wt.to_str().unwrap(), "main"],
        )
        .await;
        // Configure user inside the worktree too — `git merge` records
        // the merge commit author from the local config.
        run(&wt, &["config", "user.email", "t@example.com"]).await;
        run(&wt, &["config", "user.name", "T"]).await;

        // Commit a change on the workspace branch.
        std::fs::write(wt.join("feature.txt"), "feature\n").unwrap();
        run(&wt, &["add", "feature.txt"]).await;
        run(&wt, &["commit", "-m", "feature work"]).await;

        if seed_diverging {
            // Conflict seed: write the SAME file on main and on the
            // workspace branch with incompatible content.
            std::fs::write(wt.join("README.md"), "from-workspace\n").unwrap();
            run(&wt, &["add", "README.md"]).await;
            run(&wt, &["commit", "-m", "edit readme on workspace"]).await;

            std::fs::write(primary.join("README.md"), "from-main\n").unwrap();
            run(&primary, &["add", "README.md"]).await;
            run(&primary, &["commit", "-m", "edit readme on main"]).await;
        }

        TestRepo {
            _tmp: tmp,
            worktree: wt,
            workspace_branch: "agent/wip-x".into(),
            base_branch: "main".into(),
        }
    }

    #[tokio::test]
    async fn happy_path_returns_done_and_advances_base_ref() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(false).await;

        let outcome = merge_workspace_locally(
            &r.worktree,
            &r.workspace_branch,
            &r.base_branch,
        )
        .await
        .expect("merge ok");
        assert_eq!(outcome.status, STATUS_DONE);
        assert!(outcome.conflicting_files.is_empty());

        // Base ref now contains the feature commit.
        let log = run_git(&r.worktree, &["log", "main", "--oneline"]).await.unwrap();
        assert!(log.contains("feature work"), "merge log = {log}");
        // Worktree is back on the workspace branch.
        let head = run_git(&r.worktree, &["rev-parse", "--abbrev-ref", "HEAD"])
            .await
            .unwrap();
        assert_eq!(head.trim(), "agent/wip-x");
    }

    #[tokio::test]
    async fn conflict_returns_conflict_with_files() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(true).await;

        let outcome = merge_workspace_locally(
            &r.worktree,
            &r.workspace_branch,
            &r.base_branch,
        )
        .await
        .expect("merge call ok");
        assert_eq!(outcome.status, STATUS_CONFLICT);
        assert_eq!(outcome.conflicting_files, vec!["README.md".to_string()]);

        // CG-2 probe: a conflict leaves MERGE_HEAD behind.
        assert!(has_in_progress_merge(&r.worktree).await.unwrap());
    }

    #[tokio::test]
    async fn dirty_tree_short_circuits_to_merge_dirty_tree() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(false).await;
        // Introduce uncommitted change.
        std::fs::write(r.worktree.join("feature.txt"), "dirty\n").unwrap();

        let err = merge_workspace_locally(
            &r.worktree,
            &r.workspace_branch,
            &r.base_branch,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, AppError::MergeDirtyTree(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn base_ahead_of_origin_surfaces_merge_base_ahead() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(false).await;

        // Wire up a fake "origin" remote whose `main` is ahead of the
        // local `main`. The simplest way: clone the primary into a
        // bare repo, advance the bare's `main`, and point the worktree
        // at it.
        let bare = r._tmp.path().join("origin.git");
        run(r._tmp.path(), &["clone", "--bare", "primary", bare.to_str().unwrap()]).await;
        run(&r.worktree, &["remote", "add", "origin", bare.to_str().unwrap()]).await;

        // Advance origin/main from a scratch worktree against the bare.
        let scratch = r._tmp.path().join("scratch");
        run(r._tmp.path(), &["clone", bare.to_str().unwrap(), scratch.to_str().unwrap()]).await;
        run(&scratch, &["config", "user.email", "t@example.com"]).await;
        run(&scratch, &["config", "user.name", "T"]).await;
        std::fs::write(scratch.join("origin-ahead.txt"), "x\n").unwrap();
        run(&scratch, &["add", "origin-ahead.txt"]).await;
        run(&scratch, &["commit", "-m", "advance origin/main"]).await;
        run(&scratch, &["push", "origin", "main"]).await;

        let err = merge_workspace_locally(
            &r.worktree,
            &r.workspace_branch,
            &r.base_branch,
        )
        .await
        .unwrap_err();
        match err {
            AppError::MergeBaseAhead(base) => assert_eq!(base, "main"),
            other => panic!("expected MergeBaseAhead, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn has_in_progress_merge_false_on_clean_worktree() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(false).await;
        assert!(!has_in_progress_merge(&r.worktree).await.unwrap());
    }
}
