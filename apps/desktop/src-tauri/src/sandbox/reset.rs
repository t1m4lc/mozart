//! Discard worktree changes by hard-resetting to a recorded sha. Pairs
//! with `git_checkpoint` (S1.5.1): the runner stores a checkpoint sha
//! pre-spawn and reaches back here on rollback to restore the pre-run
//! state.
//!
//! Locked decisions (plan §4):
//! - **D1.5-A** — path-validation gate: the caller-supplied
//!   `workspace_path` must canonicalize to a path under the canonical
//!   worktrees root (also canonicalized). Rejection →
//!   `AppError::Validation("path is not under canonical worktrees root: …")`.
//!   This blocks symlink-escape attacks and prevents an arbitrary path
//!   from being passed in to `git reset --hard`.
//! - **D1.5-K** — the reset itself is a single `super::run_git` call;
//!   spawn failure → `AppError::Io`, non-zero exit (e.g. unknown sha) →
//!   `AppError::GitCmd` with stderr passthrough.

use std::path::Path;

use super::{canonical_worktrees_root, run_git};
use crate::error::AppError;

/// Hard-reset `workspace_path` to `sha`. Refuses any path that does not
/// canonicalize to a location under the canonical worktrees root
/// (D1.5-A). On a clean gate, collapses to
/// `git reset --hard <sha>` via `super::run_git`.
pub async fn discard_changes_to(
    workspace_path: &Path,
    sha: &str,
) -> Result<(), AppError> {
    let canon = workspace_path
        .canonicalize()
        .map_err(|e| AppError::Io(format!("canonicalize {workspace_path:?}: {e}")))?;
    let root = canonical_worktrees_root()?
        .canonicalize()
        .map_err(|e| AppError::Io(format!("canonicalize worktrees root: {e}")))?;
    if !canon.starts_with(&root) {
        return Err(AppError::Validation(format!(
            "path is not under canonical worktrees root: {canon:?} (root: {root:?})"
        )));
    }
    run_git(&canon, &["reset", "--hard", sha]).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::{canonical_worktrees_root, git_available, test_env_gate};
    use std::process::Command;

    /// Build a tempdir-backed git repo with identity. Mirrors the helper
    /// in `checkpoint.rs` / `diff.rs`.
    fn init_repo(repo: &Path) {
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
    }

    fn commit_all(repo: &Path, msg: &str) -> String {
        let s = Command::new("git")
            .current_dir(repo)
            .args(["add", "-A"])
            .output()
            .expect("git add");
        assert!(s.status.success(), "git add failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--allow-empty", "--no-gpg-sign", "-m", msg])
            .output()
            .expect("git commit");
        assert!(s.status.success(), "git commit failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("git rev-parse");
        assert!(s.status.success());
        String::from_utf8_lossy(&s.stdout).trim().to_string()
    }

    /// Restore prior `MOZART_WORKTREES_ROOT` value (or remove if it was
    /// unset). Used in test cleanup paths.
    fn restore_root(prev: Option<std::ffi::OsString>) {
        match prev {
            Some(v) => std::env::set_var("MOZART_WORKTREES_ROOT", v),
            None => std::env::remove_var("MOZART_WORKTREES_ROOT"),
        }
    }

    #[test]
    fn canonical_worktrees_root_honors_env_override() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");
        let tmp = tempfile::tempdir().unwrap();
        let override_path = tmp.path().to_path_buf();
        std::env::set_var("MOZART_WORKTREES_ROOT", &override_path);

        let got = canonical_worktrees_root().expect("env override resolves");
        assert_eq!(got, override_path);

        restore_root(prev);
    }

    // D1.5-L: the env-gate Mutex is intentionally held across awaits —
    // its job is to serialize entire env-mutating tests against parallel
    // `cargo test`. An async Mutex would defeat that contract.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn rejects_path_not_under_canonical_root() {
        if !git_available() {
            eprintln!("SKIP rejects_path_not_under_canonical_root: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        // Root is tempdir A; the workspace path lives in tempdir B,
        // which is canonicalizable but outside A.
        let root_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_repo = outside_dir.path().join("repo");
        std::fs::create_dir_all(&outside_repo).unwrap();
        init_repo(&outside_repo);

        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());

        let err = discard_changes_to(&outside_repo, "HEAD")
            .await
            .expect_err("must reject path outside canonical root");
        match err {
            AppError::Validation(msg) => {
                assert!(
                    msg.contains("not under canonical worktrees root"),
                    "expected validation message to call out the gate, got: {msg}"
                );
            }
            other => panic!("expected AppError::Validation, got {other:?}"),
        }

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn happy_round_trip_resets_to_recorded_sha() {
        if !git_available() {
            eprintln!("SKIP happy_round_trip_resets_to_recorded_sha: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        // Place the repo under MOZART_WORKTREES_ROOT so the gate accepts it.
        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        // Commit A: seed file only.
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        let sha_a = commit_all(&repo, "A");

        // Commit B: add a new file.
        std::fs::write(repo.join("added.txt"), "hello\n").unwrap();
        let _sha_b = commit_all(&repo, "B");
        assert!(repo.join("added.txt").exists(), "precondition: added.txt present at B");

        // Roll back to A.
        discard_changes_to(&repo, &sha_a).await.expect("reset ok");

        // The added file must be gone, HEAD must equal A.
        assert!(
            !repo.join("added.txt").exists(),
            "added.txt should be gone after reset to A"
        );
        let out = Command::new("git")
            .current_dir(&repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("git rev-parse");
        assert!(out.status.success());
        let head = String::from_utf8_lossy(&out.stdout).trim().to_string();
        assert_eq!(head, sha_a, "HEAD must equal A after reset");

        restore_root(prev);
    }

    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn rejects_non_existent_sha_with_stderr_passthrough() {
        if !git_available() {
            eprintln!("SKIP rejects_non_existent_sha_with_stderr_passthrough: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");
        // Force locale-stable stderr phrasing (D1.5-J).
        std::env::set_var("LC_ALL", "C");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);
        std::fs::write(repo.join("seed.txt"), "x\n").unwrap();
        let _head = commit_all(&repo, "seed");

        let bogus = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        let err = discard_changes_to(&repo, bogus)
            .await
            .expect_err("must fail on unknown revision");
        match err {
            AppError::GitCmd(msg) => {
                let lower = msg.to_lowercase();
                // `git reset --hard` against a 40-hex sha that doesn't
                // exist emits "Could not parse object" on modern git;
                // older / variant phrasings include "bad object",
                // "unknown revision" and "bad revision". Accept any
                // (D1.5-J: stderr text is git-version-dependent —
                // substring match only).
                assert!(
                    lower.contains("unknown revision")
                        || lower.contains("bad revision")
                        || lower.contains("bad object")
                        || lower.contains("could not parse object"),
                    "expected stderr to mention unknown/bad revision, bad object, or could-not-parse-object, got: {msg}"
                );
            }
            other => panic!("expected AppError::GitCmd, got {other:?}"),
        }

        restore_root(prev);
    }

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn symlink_escape_blocked_by_canonicalize_gate() {
        if !git_available() {
            eprintln!("SKIP symlink_escape_blocked_by_canonicalize_gate: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        // Root holds a symlink that points outside; the actual repo lives
        // outside the root. The gate must reject after canonicalize.
        let root_dir = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let outside_repo = outside_dir.path().join("repo");
        std::fs::create_dir_all(&outside_repo).unwrap();
        init_repo(&outside_repo);

        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let link = root_dir.path().join("escape");
        std::os::unix::fs::symlink(&outside_repo, &link).expect("symlink");

        let err = discard_changes_to(&link, "HEAD")
            .await
            .expect_err("must reject symlink escape");
        match err {
            AppError::Validation(msg) => {
                assert!(
                    msg.contains("not under canonical worktrees root"),
                    "expected gate rejection, got: {msg}"
                );
            }
            other => panic!("expected AppError::Validation, got {other:?}"),
        }

        restore_root(prev);
    }
}
