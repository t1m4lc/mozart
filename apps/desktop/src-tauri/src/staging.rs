//! Per-file index operations for the Changes tab context menu (P2.5).
//!
//! - `stage(worktree, path)` → `git add -- <path>`.
//! - `unstage(worktree, path)` → `git reset HEAD -- <path>`.
//! - `is_staged(worktree, path)` → reads the X byte of `git status
//!   --porcelain=v1 -z -- <path>`. `true` when the index has changes
//!   for that path (X is not space and not `?`).
//!
//! Path validation mirrors `commit::validate_path` (no absolutes, no
//! `..` segments, no NUL bytes). Failures map to `AppError::Validation`
//! so the UI can surface a clean message.

use std::path::Path;

use crate::error::AppError;
use crate::sandbox;

pub async fn stage(worktree: &Path, path: &str) -> Result<(), AppError> {
    validate_path(path)?;
    sandbox::run_git(worktree, &["add", "--", path]).await.map(|_| ())
}

pub async fn unstage(worktree: &Path, path: &str) -> Result<(), AppError> {
    validate_path(path)?;
    // `git reset HEAD -- <path>` is the legacy form that works on every
    // git version we support. Modern git also exposes `git restore
    // --staged`, but the reset form has identical semantics here and
    // matches the existing reset helpers in the sandbox module.
    sandbox::run_git(worktree, &["reset", "HEAD", "--", path]).await.map(|_| ())
}

pub async fn is_staged(worktree: &Path, path: &str) -> Result<bool, AppError> {
    validate_path(path)?;
    let out = sandbox::run_git_capture(
        worktree,
        &["status", "--porcelain=v1", "-z", "--", path],
    )
    .await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!("git status failed: {stderr}")));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    // Empty stdout → the path is clean (no entry in porcelain output).
    let Some(record) = stdout.split('\0').find(|r| !r.is_empty()) else {
        return Ok(false);
    };
    if record.len() < 2 {
        return Ok(false);
    }
    let x = record.as_bytes()[0];
    Ok(x != b' ' && x != b'?')
}

fn validate_path(p: &str) -> Result<(), AppError> {
    if p.is_empty() || p.starts_with('/') || p.contains('\0') {
        return Err(AppError::Validation(format!("invalid path: {p}")));
    }
    if p.split('/').any(|seg| seg == "..") {
        return Err(AppError::Validation(format!("path escapes workspace: {p}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

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

    fn commit_all(repo: &Path, msg: &str) {
        let s = Command::new("git")
            .current_dir(repo)
            .args(["add", "-A"])
            .output()
            .expect("git add");
        assert!(s.status.success());
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--allow-empty", "--no-gpg-sign", "-m", msg])
            .output()
            .expect("git commit");
        assert!(s.status.success());
    }

    #[test]
    fn validate_path_rejects_escapes() {
        assert!(validate_path("../escape").is_err());
        assert!(validate_path("/absolute").is_err());
        assert!(validate_path("ok/../bad").is_err());
        assert!(validate_path("").is_err());
        assert!(validate_path("ok/sub").is_ok());
    }

    #[tokio::test]
    async fn stage_then_unstage_round_trip() {
        if !git_available() {
            eprintln!("SKIP stage_then_unstage_round_trip: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);
        // Initial commit so HEAD exists for `git reset HEAD`.
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        commit_all(repo, "seed");
        // Modify the seed file in the worktree.
        std::fs::write(repo.join("seed.txt"), "v2\n").unwrap();

        // Pre-stage: not staged.
        assert!(!is_staged(repo, "seed.txt").await.unwrap());

        // Stage → is_staged flips to true.
        stage(repo, "seed.txt").await.expect("stage ok");
        assert!(is_staged(repo, "seed.txt").await.unwrap());

        // Unstage → is_staged flips back to false; the working-tree
        // change is preserved (file still has v2).
        unstage(repo, "seed.txt").await.expect("unstage ok");
        assert!(!is_staged(repo, "seed.txt").await.unwrap());
        assert_eq!(std::fs::read_to_string(repo.join("seed.txt")).unwrap(), "v2\n");
    }

    #[tokio::test]
    async fn is_staged_returns_false_for_clean_path() {
        if !git_available() {
            eprintln!("SKIP is_staged_returns_false_for_clean_path: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        commit_all(repo, "seed");
        assert!(!is_staged(repo, "seed.txt").await.unwrap());
    }

    #[tokio::test]
    async fn is_staged_recognises_untracked_as_unstaged() {
        if !git_available() {
            eprintln!("SKIP is_staged_recognises_untracked_as_unstaged: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        commit_all(repo, "seed");
        // Brand-new file → X byte is `?`, not staged.
        std::fs::write(repo.join("fresh.txt"), "hi\n").unwrap();
        assert!(!is_staged(repo, "fresh.txt").await.unwrap());
    }
}
