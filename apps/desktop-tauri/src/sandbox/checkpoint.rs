//! Pre-run git checkpoint — records the current HEAD sha so the
//! post-run diff (S1.5.2) and rollback (S1.5.3) have a stable base.
//! No commit is created; the sha is a lightweight reference point only.

use std::path::Path;

use super::run_git;
use crate::error::AppError;

/// Record the current HEAD sha as a checkpoint reference point and return
/// it (40 hex chars, trimmed). Does NOT create any commit — the sha is
/// used by `capture_diff` / `discard_changes_to` as the pre-run base.
pub async fn git_checkpoint(workspace_path: &Path) -> Result<String, AppError> {
    let out = run_git(workspace_path, &["rev-parse", "HEAD"]).await?;
    Ok(out.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::git_available;
    use std::process::Command;

    /// Build a tempdir-backed git repo with identity and one initial
    /// commit. Mirrors `spikes/spike_a_worktree.rs` setup.
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
        let s = Command::new("git")
            .current_dir(repo)
            .args([
                "commit",
                "--allow-empty",
                "--no-gpg-sign",
                "-m",
                "init",
            ])
            .output()
            .expect("initial commit");
        assert!(s.status.success(), "initial commit failed: {:?}", s);
    }

    fn is_hex_sha40(s: &str) -> bool {
        s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit())
    }

    #[tokio::test]
    async fn happy_path_returns_40_hex_sha_matching_head() {
        if !git_available() {
            eprintln!("SKIP happy_path_returns_40_hex_sha_matching_head: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);

        // Write a file so the checkpoint has something to add.
        std::fs::write(repo.join("hello.txt"), "world\n").unwrap();

        let sha = git_checkpoint(repo).await.expect("checkpoint ok");
        assert!(
            is_hex_sha40(&sha),
            "expected 40-hex-char sha, got {:?}",
            sha
        );

        // HEAD must resolve to exactly that sha.
        let head_out = Command::new("git")
            .current_dir(repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        assert!(head_out.status.success());
        let head = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
        assert_eq!(head, sha, "HEAD must equal the returned checkpoint sha");
    }

    #[tokio::test]
    async fn two_checkpoints_on_same_head_return_same_sha() {
        if !git_available() {
            eprintln!("SKIP two_checkpoints_on_same_head_return_same_sha: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);

        let sha1 = git_checkpoint(repo).await.expect("first checkpoint");
        let sha2 = git_checkpoint(repo).await.expect("second checkpoint");
        assert!(is_hex_sha40(&sha1));
        assert!(is_hex_sha40(&sha2));
        // No commits created — both return the same HEAD sha.
        assert_eq!(sha1, sha2, "checkpoints on the same HEAD must return equal shas");
    }

    #[tokio::test]
    async fn propagates_stderr_on_failure_against_non_repo() {
        if !git_available() {
            eprintln!("SKIP propagates_stderr_on_failure_against_non_repo: git not on PATH");
            return;
        }
        // Force locale-stable stderr phrasing (D1.5-J).
        std::env::set_var("LC_ALL", "C");
        let tmp = tempfile::tempdir().unwrap();
        let not_a_repo = tmp.path();
        // Confirm there's no .git so the test is meaningful.
        assert!(!not_a_repo.join(".git").exists());

        let err = git_checkpoint(not_a_repo)
            .await
            .expect_err("must fail on non-repo");
        match err {
            AppError::GitCmd(msg) => {
                let lower = msg.to_lowercase();
                assert!(
                    lower.contains("not a git repository"),
                    "stderr substring not propagated; got: {msg}"
                );
            }
            other => panic!("expected AppError::GitCmd, got {other:?}"),
        }
    }
}
