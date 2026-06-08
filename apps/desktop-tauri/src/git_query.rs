//! Read-only git probes used by the workspace registration flow
//! (Step 1.6). This module never mutates the user's source repo —
//! every operation here is either a `git` query or a metadata stat.
//!
//! Surfaces:
//! - [`RepoIssue`]: typed reasons we refuse to register a repo.
//! - [`validate_repo`]: dispatches the refusal ladder (NotARepo →
//!   NestedRepo → UnsupportedSubmodules → DetachedHead → LfsRequired).
//! - [`list_branches`]: enumerates local branches via `for-each-ref`.
//! - [`check_git_available`]: sync host probe for `git --version`.
//!
//! All git invocations go through [`crate::sandbox::run_git`] /
//! [`crate::sandbox::run_git_capture`] so error mapping stays in one
//! place (D1.5-K).

use std::path::Path;

use serde::Serialize;

use crate::error::AppError;
use crate::sandbox::{run_git, run_git_capture};

/// Typed reasons workspace registration refuses a candidate repo.
///
/// Serialized with `#[serde(tag = "kind", rename_all = "snake_case")]`
/// so the Angular layer receives `{ kind: "nested_repo" }` etc.
///
/// Deliberately does NOT derive `Deserialize` (Rust-originating only)
/// nor `PartialEq` (no test/runtime equality use case yet).
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RepoIssue {
    NestedRepo,
    DetachedHead,
    NotARepo,
    LfsRequired,
    UnsupportedSubmodules,
}

/// Sync host probe: returns `true` iff `git --version` exits 0.
pub fn check_git_available() -> bool {
    use crate::platform::NoWindow;
    std::process::Command::new("git")
        .arg("--version")
        .no_window()
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Best-effort LFS host probe: returns `true` iff `git lfs --version`
/// exits 0. Used to decide whether to even attempt LFS file detection.
fn check_lfs_available() -> bool {
    use crate::platform::NoWindow;
    std::process::Command::new("git")
        .args(["lfs", "--version"])
        .no_window()
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Validate a candidate source repo. Dispatch order (per plan §6):
///
/// 1. `NotARepo` — `git rev-parse --git-dir` fails.
/// 2. `NestedRepo` — any depth-1 child directory itself contains `.git`.
/// 3. `UnsupportedSubmodules` — non-empty `.gitmodules` at repo root.
/// 4. `DetachedHead` — `git symbolic-ref --quiet HEAD` fails.
/// 5. `LfsRequired` — best-effort: if `git lfs` is on the host and
///    `git lfs ls-files` returns any output, refuse.
///
/// Returns `Ok(())` if none of the above fire.
pub async fn validate_repo(path: &Path) -> Result<(), RepoIssue> {
    // 1. NotARepo
    let head_dir = run_git_capture(path, &["rev-parse", "--git-dir"])
        .await
        .map_err(|_| RepoIssue::NotARepo)?;
    if !head_dir.status.success() {
        return Err(RepoIssue::NotARepo);
    }

    // 2. NestedRepo (depth-1 only)
    if let Ok(read) = std::fs::read_dir(path) {
        for entry in read.flatten() {
            if entry.file_name() == ".git" {
                continue;
            }
            let p = entry.path();
            if p.is_dir() && p.join(".git").exists() {
                return Err(RepoIssue::NestedRepo);
            }
        }
    }

    // 3. UnsupportedSubmodules
    let gm = path.join(".gitmodules");
    if let Ok(meta) = std::fs::metadata(&gm) {
        if meta.is_file() && meta.len() > 0 {
            return Err(RepoIssue::UnsupportedSubmodules);
        }
    }

    // 4. DetachedHead
    let head = run_git_capture(path, &["symbolic-ref", "--quiet", "HEAD"])
        .await
        .map_err(|_| RepoIssue::NotARepo)?;
    if !head.status.success() {
        return Err(RepoIssue::DetachedHead);
    }

    // 5. LfsRequired (best-effort)
    if check_lfs_available() {
        if let Ok(out) = run_git_capture(path, &["lfs", "ls-files"]).await {
            if out.status.success() && !out.stdout.is_empty() {
                return Err(RepoIssue::LfsRequired);
            }
        }
    }

    Ok(())
}

/// Initialise a fresh git repo at `path` on branch `main`, with a
/// local user identity and one empty seed commit so the worktree has
/// a HEAD to branch from. Idempotent on the local-config writes.
/// Used by `add_repo_impl` when the user picks a folder that isn't
/// yet a git repo — saves them a manual `git init` round-trip.
pub async fn init_repo(path: &Path) -> Result<(), AppError> {
    run_git(path, &["init", "--initial-branch=main"]).await?;
    // Local identity so the seed commit doesn't fail when the user
    // hasn't configured a global git user. Local config beats global,
    // so this never overrides their preference.
    run_git(path, &["config", "user.email", "mozart@local"]).await?;
    run_git(path, &["config", "user.name", "Mozart"]).await?;
    // Seed commit so HEAD points at a branch with at least one commit;
    // otherwise `create_workspace` has no base branch to spawn from.
    run_git(
        path,
        &[
            "commit",
            "--allow-empty",
            "--no-gpg-sign",
            "-m",
            "Initial commit",
        ],
    )
    .await?;
    Ok(())
}

/// Enumerate local branches in `path` via
/// `git for-each-ref --format=%(refname:short) refs/heads/`.
/// Local branches plus remote-tracking branches, by short name. A clone whose
/// integration branch (e.g. `develop`) lives only on the remote still surfaces
/// it, so a workspace can fork from it; `crate::worktree::create` resolves such
/// a name back to `origin/<branch>` as the worktree start point. Local heads
/// win over a same-named remote branch; the bare `<remote>/HEAD` pointer and
/// duplicate remote names are dropped. Locals first, then remotes.
pub async fn list_branches(path: &Path) -> Result<Vec<String>, AppError> {
    let out = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )
    .await?;
    let mut seen = std::collections::HashSet::new();
    let mut local = Vec::new();
    let mut remote = Vec::new();
    for line in out.lines() {
        let refname = line.trim();
        if let Some(branch) = refname.strip_prefix("refs/heads/") {
            if seen.insert(branch.to_string()) {
                local.push(branch.to_string());
            }
        } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
            // `rest` is `<remote>/<branch...>`; drop the remote segment and
            // skip the `<remote>/HEAD` symbolic pointer.
            if let Some((_, branch)) = rest.split_once('/') {
                if branch == "HEAD" || branch.is_empty() {
                    continue;
                }
                if !seen.contains(branch) && !remote.iter().any(|r| r == branch) {
                    remote.push(branch.to_string());
                }
            }
        }
    }
    local.extend(remote);
    Ok(local)
}

/// The repo's currently checked-out branch (`git rev-parse --abbrev-ref
/// HEAD`). Returns `None` on a detached HEAD (git prints the literal
/// `HEAD`) so the caller can fall back to its own default.
pub async fn current_branch(path: &Path) -> Result<Option<String>, AppError> {
    let out = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    let branch = out.trim();
    if branch.is_empty() || branch == "HEAD" {
        return Ok(None);
    }
    Ok(Some(branch.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Skip-gate mirroring the sandbox pattern: tests that need a real
    /// `git` on PATH bail with `eprintln!` instead of `#[ignore]`.
    fn require_git() -> bool {
        if !crate::sandbox::git_available() {
            eprintln!("skipping: git not available on PATH");
            return false;
        }
        true
    }

    /// Initialise a tempdir as a git repo on branch `main` with an
    /// initial commit. Identity is configured locally so `commit`
    /// works under any CI environment.
    fn init_repo() -> (TempDir, PathBuf) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().to_path_buf();
        let run = |args: &[&str]| {
            let status = std::process::Command::new("git")
                .args(args)
                .current_dir(&path)
                .output()
                .expect("git spawn");
            assert!(
                status.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&status.stderr)
            );
        };
        run(&["init", "--initial-branch=main"]);
        run(&["config", "user.email", "test@example.com"]);
        run(&["config", "user.name", "Test"]);
        fs::write(path.join("README.md"), "hello").expect("write readme");
        run(&["add", "."]);
        run(&["commit", "-m", "initial"]);
        (tmp, path)
    }

    #[tokio::test]
    async fn validate_repo_happy_path() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        let res = validate_repo(&path).await;
        assert!(res.is_ok(), "expected Ok, got {res:?}");
    }

    #[tokio::test]
    async fn validate_repo_refuses_nested_repo() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        let nested = path.join("inner");
        fs::create_dir(&nested).expect("mkdir inner");
        let status = std::process::Command::new("git")
            .args(["init"])
            .current_dir(&nested)
            .output()
            .expect("git init inner");
        assert!(status.status.success());
        let res = validate_repo(&path).await;
        assert!(
            matches!(res, Err(RepoIssue::NestedRepo)),
            "expected NestedRepo, got {res:?}"
        );
    }

    #[tokio::test]
    async fn validate_repo_refuses_detached_head() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        let status = std::process::Command::new("git")
            .args(["checkout", "--detach", "HEAD"])
            .current_dir(&path)
            .output()
            .expect("git detach");
        assert!(
            status.status.success(),
            "detach failed: {}",
            String::from_utf8_lossy(&status.stderr)
        );
        let res = validate_repo(&path).await;
        assert!(
            matches!(res, Err(RepoIssue::DetachedHead)),
            "expected DetachedHead, got {res:?}"
        );
    }

    #[tokio::test]
    async fn validate_repo_refuses_missing_git() {
        if !require_git() {
            return;
        }
        let tmp = tempfile::tempdir().expect("tempdir");
        let res = validate_repo(tmp.path()).await;
        assert!(
            matches!(res, Err(RepoIssue::NotARepo)),
            "expected NotARepo, got {res:?}"
        );
    }

    #[tokio::test]
    async fn validate_repo_refuses_submodules() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        fs::write(
            path.join(".gitmodules"),
            "[submodule \"x\"]\n\tpath = x\n\turl = ./x\n",
        )
        .expect("write .gitmodules");
        let res = validate_repo(&path).await;
        assert!(
            matches!(res, Err(RepoIssue::UnsupportedSubmodules)),
            "expected UnsupportedSubmodules, got {res:?}"
        );
    }

    #[tokio::test]
    async fn list_branches_returns_both() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        let status = std::process::Command::new("git")
            .args(["branch", "feature"])
            .current_dir(&path)
            .output()
            .expect("git branch");
        assert!(status.status.success());
        let branches = list_branches(&path).await.expect("list_branches");
        assert!(
            branches.iter().any(|b| b == "main"),
            "missing main: {branches:?}"
        );
        assert!(
            branches.iter().any(|b| b == "feature"),
            "missing feature: {branches:?}"
        );
    }

    #[tokio::test]
    async fn list_branches_includes_remote_only_and_dedupes() {
        if !require_git() {
            return;
        }
        let (_tmp, path) = init_repo();
        let run = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(&path)
                .output()
                .expect("git spawn");
            assert!(out.status.success(), "git {args:?} failed");
        };
        // A remote-only `develop` and a remote `main` shadowed by the local one.
        run(&["update-ref", "refs/remotes/origin/develop", "HEAD"]);
        run(&["update-ref", "refs/remotes/origin/main", "HEAD"]);
        run(&["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

        let branches = list_branches(&path).await.expect("list_branches");
        assert!(
            branches.iter().any(|b| b == "develop"),
            "remote-only develop missing: {branches:?}"
        );
        assert_eq!(
            branches.iter().filter(|b| *b == "main").count(),
            1,
            "local main duplicated by origin/main: {branches:?}"
        );
        assert!(
            !branches.iter().any(|b| b == "HEAD"),
            "origin/HEAD leaked: {branches:?}"
        );
    }

    #[test]
    fn check_git_available_true_when_git_on_path() {
        if !require_git() {
            return;
        }
        assert!(check_git_available());
    }
}
