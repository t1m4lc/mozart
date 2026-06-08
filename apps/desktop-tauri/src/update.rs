//! "Update from base" flow — the mirror of `merge.rs`.
//!
//! Where `merge.rs` pushes the workspace branch *into* the base
//! (workspace → base), this module pulls the freshest base *into* the
//! workspace branch (base → workspace) so the user can keep their work
//! current with `origin/<base>`.
//!
//! Two surfaces:
//!
//! 1. [`base_freshness`] — a cheap behind/ahead probe of the workspace
//!    branch relative to `origin/<base>`. `fetch = false` reads the
//!    last-fetched remote ref (used on hydrate so the toolbar renders
//!    immediately); `fetch = true` does a best-effort `git fetch` first
//!    (used on demand / when opening the update flow). Measuring against
//!    `origin/<base>` — not the local base ref — means a stale local
//!    base can never show a false "up to date".
//!
//! 2. [`update_workspace_from_base`] — the update flow:
//!    1. Dirty tree? → `AppError::MergeDirtyTree` (commit/discard first;
//!       we refuse rather than auto-stash).
//!    2. Best-effort `git fetch` so we merge the freshest base.
//!    3. `git merge --no-ff origin/<base>` onto the workspace branch.
//!       The workspace branch is already checked out in this worktree,
//!       so no detached-HEAD dance is needed (unlike `merge.rs`, which
//!       merges into a base ref checked out elsewhere).
//!    4. On success → `Done`. On conflict → leave the worktree mid-merge
//!       for the user to resolve in their IDE and return `Conflict`.
//!
//! Merge (not rebase) is deliberate: workspace branches may already be
//! pushed or attached to a PR, and rebasing would rewrite published
//! history. A conflict leaves `MERGE_HEAD` behind, so the existing
//! `merge::has_in_progress_merge` boot scan (CG-2) recovers an update
//! interrupted by a crash exactly as it does for the merge flow.

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::merge::{MergeOutcome, STATUS_CONFLICT, STATUS_DONE};
use crate::sandbox::{run_git, run_git_capture};

/// How far the workspace branch has drifted from `origin/<base>`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BaseFreshness {
    /// Commits on `origin/<base>` not yet in the workspace branch — the
    /// "N behind <base>" count. `0` means up to date.
    pub behind: u64,
    /// Commits on the workspace branch not yet on `origin/<base>`.
    pub ahead: u64,
    /// `false` when `origin/<base>` couldn't be resolved (no remote, or
    /// it was never fetched). `behind`/`ahead` are then measured against
    /// the local base ref as a fallback, and the UI can soften its copy.
    pub remote_tracked: bool,
}

/// Resolve the ref the workspace branch should be compared/merged
/// against. Prefers `origin/<base>` (optionally fetching first); falls
/// back to the local `<base>` when there is no origin or the remote ref
/// isn't present locally. Returns `(ref, remote_tracked)`.
async fn resolve_base_ref(
    worktree: &Path,
    base_branch: &str,
    fetch: bool,
) -> Result<(String, bool), AppError> {
    let origin = run_git_capture(worktree, &["remote", "get-url", "origin"]).await?;
    if origin.status.success() {
        if fetch {
            // Best-effort: an offline machine or a missing branch on the
            // remote shouldn't break the probe / update.
            let _ = run_git(worktree, &["fetch", "origin", base_branch]).await;
        }
        let probe = run_git_capture(
            worktree,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/remotes/origin/{base_branch}"),
            ],
        )
        .await?;
        if probe.status.success() {
            return Ok((format!("origin/{base_branch}"), true));
        }
    }
    Ok((base_branch.to_string(), false))
}

/// Behind/ahead of the workspace branch relative to `origin/<base>`
/// (falling back to the local base). `fetch` controls whether we hit the
/// network first.
pub async fn base_freshness(
    worktree: &Path,
    workspace_branch: &str,
    base_branch: &str,
    fetch: bool,
) -> Result<BaseFreshness, AppError> {
    let (cmp_ref, remote_tracked) = resolve_base_ref(worktree, base_branch, fetch).await?;

    // `--left-right --count` over `<branch>...<base>` yields
    // "<ahead>\t<behind>": left = commits only on the workspace branch,
    // right = commits only on the base.
    let counts = run_git_capture(
        worktree,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{workspace_branch}...{cmp_ref}"),
        ],
    )
    .await?;
    let (ahead, behind) = if counts.status.success() {
        parse_left_right(&String::from_utf8_lossy(&counts.stdout))
    } else {
        (0, 0)
    };

    Ok(BaseFreshness {
        behind,
        ahead,
        remote_tracked,
    })
}

fn parse_left_right(s: &str) -> (u64, u64) {
    let mut it = s.split_whitespace();
    let left = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let right = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (left, right)
}

/// Merge the freshest base into the workspace branch. See module docs
/// for the step-by-step flow.
pub async fn update_workspace_from_base(
    worktree: &Path,
    workspace_branch: &str,
    base_branch: &str,
) -> Result<MergeOutcome, AppError> {
    // Step 1 — refuse if the workspace has uncommitted changes. We
    // refuse rather than auto-stash so the user explicitly decides what
    // to do with in-flight work before history moves under them.
    let porcelain = run_git(worktree, &["status", "--porcelain"]).await?;
    if !porcelain.trim().is_empty() {
        return Err(AppError::MergeDirtyTree(workspace_branch.into()));
    }

    // Step 2 — resolve + fetch the base we're pulling in. We always want
    // the freshest base, so `fetch = true` here.
    let (merge_ref, _remote_tracked) = resolve_base_ref(worktree, base_branch, true).await?;

    // Step 3 — merge the base into the (already checked-out) workspace
    // branch. A non-zero exit usually means a conflict; confirm via
    // `--diff-filter=U` before classifying.
    let merge_msg = format!("Merge {merge_ref} into {workspace_branch}");
    let merge_args: [&str; 5] = ["merge", "--no-ff", "-m", merge_msg.as_str(), &merge_ref];
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
            // Not a conflict — abort so we don't strand the worktree
            // mid-merge, then surface the raw git error.
            let _ = run_git(worktree, &["merge", "--abort"]).await;
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

    // Success — the merge commit (or a no-op "Already up to date") is at
    // HEAD on the workspace branch. Nothing else to move.
    Ok(MergeOutcome {
        status: STATUS_DONE.into(),
        conflicting_files: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merge::has_in_progress_merge;
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

    /// Build a primary repo cloned through a bare "origin", plus a
    /// workspace worktree on `agent/wip-x` forked from `main`. Returns
    /// once the worktree is clean and tracking `origin`.
    ///
    /// `advance_origin_base` pushes an extra commit to `origin/main`
    /// after the fork so the workspace is "behind". `seed_conflict`
    /// additionally edits the same file on the workspace branch so the
    /// pull conflicts.
    async fn make_repo(advance_origin_base: bool, seed_conflict: bool) -> TestRepo {
        let tmp = tempfile::tempdir().expect("tempdir");

        // Seed a primary repo with a base file on main.
        let seed = tmp.path().join("seed");
        std::fs::create_dir_all(&seed).unwrap();
        run(&seed, &["init", "-q", "-b", "main"]).await;
        run(&seed, &["config", "user.email", "t@example.com"]).await;
        run(&seed, &["config", "user.name", "T"]).await;
        std::fs::write(seed.join("README.md"), "base\n").unwrap();
        run(&seed, &["add", "README.md"]).await;
        run(&seed, &["commit", "-m", "base file"]).await;

        // Bare origin cloned from the seed.
        let bare = tmp.path().join("origin.git");
        run(tmp.path(), &["clone", "--bare", "seed", bare.to_str().unwrap()]).await;

        // Primary working clone of origin.
        let primary = tmp.path().join("primary");
        run(tmp.path(), &["clone", bare.to_str().unwrap(), primary.to_str().unwrap()]).await;
        run(&primary, &["config", "user.email", "t@example.com"]).await;
        run(&primary, &["config", "user.name", "T"]).await;

        // Workspace worktree on agent/wip-x off main, with one commit.
        let wt = tmp.path().join("wt");
        run(
            &primary,
            &["worktree", "add", "-b", "agent/wip-x", wt.to_str().unwrap(), "main"],
        )
        .await;
        run(&wt, &["config", "user.email", "t@example.com"]).await;
        run(&wt, &["config", "user.name", "T"]).await;
        std::fs::write(wt.join("feature.txt"), "feature\n").unwrap();
        run(&wt, &["add", "feature.txt"]).await;
        run(&wt, &["commit", "-m", "feature work"]).await;

        if advance_origin_base {
            // Advance origin/main from a scratch clone and push.
            let scratch = tmp.path().join("scratch");
            run(tmp.path(), &["clone", bare.to_str().unwrap(), scratch.to_str().unwrap()]).await;
            run(&scratch, &["config", "user.email", "t@example.com"]).await;
            run(&scratch, &["config", "user.name", "T"]).await;
            let content = if seed_conflict { "from-main\n" } else { "base\nmore-on-main\n" };
            std::fs::write(scratch.join("README.md"), content).unwrap();
            run(&scratch, &["add", "README.md"]).await;
            run(&scratch, &["commit", "-m", "advance origin/main"]).await;
            run(&scratch, &["push", "origin", "main"]).await;
        }

        if seed_conflict {
            // Edit the same file on the workspace branch so the pull of
            // origin/main collides.
            std::fs::write(wt.join("README.md"), "from-workspace\n").unwrap();
            run(&wt, &["add", "README.md"]).await;
            run(&wt, &["commit", "-m", "edit readme on workspace"]).await;
        }

        TestRepo {
            _tmp: tmp,
            worktree: wt,
            workspace_branch: "agent/wip-x".into(),
            base_branch: "main".into(),
        }
    }

    #[tokio::test]
    async fn freshness_reports_behind_after_fetch() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(true, false).await;

        let f = base_freshness(&r.worktree, &r.workspace_branch, &r.base_branch, true)
            .await
            .expect("freshness ok");
        assert!(f.remote_tracked, "origin/main should be tracked");
        assert_eq!(f.behind, 1, "one commit on origin/main not yet pulled");
        assert_eq!(f.ahead, 1, "the feature commit is ahead of base");
    }

    #[tokio::test]
    async fn freshness_up_to_date_when_origin_not_advanced() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(false, false).await;

        let f = base_freshness(&r.worktree, &r.workspace_branch, &r.base_branch, true)
            .await
            .expect("freshness ok");
        assert_eq!(f.behind, 0, "nothing new on origin/main");
    }

    #[tokio::test]
    async fn update_happy_path_returns_done_and_pulls_base() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(true, false).await;

        let outcome =
            update_workspace_from_base(&r.worktree, &r.workspace_branch, &r.base_branch)
                .await
                .expect("update ok");
        assert_eq!(outcome.status, STATUS_DONE);
        assert!(outcome.conflicting_files.is_empty());

        // The base advance is now in the workspace branch history.
        let log = run_git(&r.worktree, &["log", "--oneline"]).await.unwrap();
        assert!(log.contains("advance origin/main"), "update log = {log}");
        // Still on the workspace branch.
        let head = run_git(&r.worktree, &["rev-parse", "--abbrev-ref", "HEAD"])
            .await
            .unwrap();
        assert_eq!(head.trim(), "agent/wip-x");
        // And now up to date.
        let f = base_freshness(&r.worktree, &r.workspace_branch, &r.base_branch, true)
            .await
            .unwrap();
        assert_eq!(f.behind, 0);
    }

    #[tokio::test]
    async fn update_conflict_returns_conflict_with_files() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(true, true).await;

        let outcome =
            update_workspace_from_base(&r.worktree, &r.workspace_branch, &r.base_branch)
                .await
                .expect("update call ok");
        assert_eq!(outcome.status, STATUS_CONFLICT);
        assert_eq!(outcome.conflicting_files, vec!["README.md".to_string()]);
        // Crash-recovery hook (CG-2) sees the in-progress merge.
        assert!(has_in_progress_merge(&r.worktree).await.unwrap());
    }

    #[tokio::test]
    async fn update_dirty_tree_short_circuits() {
        if !git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = test_env_gate().lock().unwrap();
        let r = make_repo(true, false).await;
        std::fs::write(r.worktree.join("feature.txt"), "dirty\n").unwrap();

        let err =
            update_workspace_from_base(&r.worktree, &r.workspace_branch, &r.base_branch)
                .await
                .unwrap_err();
        assert!(matches!(err, AppError::MergeDirtyTree(_)), "got {err:?}");
    }
}
