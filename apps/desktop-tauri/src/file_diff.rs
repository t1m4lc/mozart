//! Per-file unified diff between the workspace's working tree and its
//! `base_branch`. Powers Phase 4c's diff panel.
//!
//! Behavior:
//! - Tracked files: `git diff <base_branch> -- <path>`. Includes both
//!   committed-vs-base changes AND uncommitted working-tree edits, so
//!   the panel always reflects what the user (or agent) currently sees.
//! - Untracked files: `git diff` ignores them, so we synthesize an
//!   "all-added" unified diff by reading the file body and prefixing
//!   each line with `+`. Empty file → empty diff.
//! - Empty diff (file unchanged vs. base) → empty string. Caller maps
//!   to "No changes." in the UI.
//! - Path validation: rejects empty, absolute (`/...`), or any segment
//!   containing `..` to prevent escapes outside the worktree. Matches
//!   the `workspace-relative, forward-slash` invariant the file tree
//!   already enforces.

use std::path::Path;

use crate::error::AppError;
use crate::sandbox;

/// Resolve the unified diff text for one file in a workspace, vs.
/// `base_branch`. See module docs for behavior + path-safety rules.
pub async fn get_file_diff(
    worktree: &Path,
    base_branch: &str,
    path: &str,
) -> Result<String, AppError> {
    validate_path(path)?;

    // Tracked path: working tree (incl. staged + unstaged) vs base.
    let unified = sandbox::run_git_capture(worktree, &["diff", base_branch, "--", path]).await?;
    if !unified.status.success() {
        let stderr = String::from_utf8_lossy(&unified.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!(
            "git diff {base_branch} -- {path} failed: {stderr}"
        )));
    }
    let body = String::from_utf8_lossy(&unified.stdout).into_owned();
    if !body.is_empty() {
        return Ok(body);
    }

    // No tracked diff — could be unchanged OR untracked. Probe status.
    if is_untracked(worktree, path).await? {
        return synthesize_added(worktree, path).await;
    }

    Ok(String::new())
}

fn validate_path(path: &str) -> Result<(), AppError> {
    if path.is_empty() {
        return Err(AppError::Validation("empty path".into()));
    }
    if path.starts_with('/') || path.contains('\0') {
        return Err(AppError::Validation(format!("invalid path: {path}")));
    }
    for segment in path.split('/') {
        if segment == ".." {
            return Err(AppError::Validation(format!(
                "path escapes workspace: {path}"
            )));
        }
    }
    Ok(())
}

async fn is_untracked(worktree: &Path, path: &str) -> Result<bool, AppError> {
    let out =
        sandbox::run_git_capture(worktree, &["status", "--porcelain=v1", "--", path]).await?;
    if !out.status.success() {
        return Ok(false);
    }
    let s = String::from_utf8_lossy(&out.stdout);
    Ok(s.starts_with("??"))
}

async fn synthesize_added(worktree: &Path, path: &str) -> Result<String, AppError> {
    let abs = worktree.join(path);
    let body = tokio::fs::read_to_string(&abs)
        .await
        .map_err(|e| AppError::Io(format!("read {abs:?}: {e}")))?;
    let line_count = body.lines().count().max(1);
    let mut out = String::with_capacity(body.len() + 256);
    out.push_str(&format!("diff --git a/{path} b/{path}\n"));
    out.push_str("new file\n");
    out.push_str(&format!("--- /dev/null\n+++ b/{path}\n"));
    out.push_str(&format!("@@ -0,0 +1,{line_count} @@\n"));
    if body.is_empty() {
        out.push_str("+\n");
    } else {
        for line in body.split_inclusive('\n') {
            out.push('+');
            out.push_str(line);
        }
        // Ensure trailing newline.
        if !out.ends_with('\n') {
            out.push('\n');
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_path_accepts_workspace_relative() {
        assert!(validate_path("foo.txt").is_ok());
        assert!(validate_path("src/lib.rs").is_ok());
        assert!(validate_path("a/b/c.txt").is_ok());
    }

    #[test]
    fn validate_path_rejects_dangerous_inputs() {
        assert!(validate_path("").is_err());
        assert!(validate_path("/etc/passwd").is_err());
        assert!(validate_path("../escape").is_err());
        assert!(validate_path("ok/../bad").is_err());
        assert!(validate_path("with\0null").is_err());
    }

    #[tokio::test]
    async fn synthesize_added_emits_unified_header() {
        let tmp = tempfile::tempdir().unwrap();
        let path = "hello.txt";
        let abs = tmp.path().join(path);
        std::fs::write(&abs, "line one\nline two\n").unwrap();
        let s = synthesize_added(tmp.path(), path).await.unwrap();
        assert!(s.contains("diff --git a/hello.txt b/hello.txt"));
        assert!(s.contains("--- /dev/null"));
        assert!(s.contains("+++ b/hello.txt"));
        assert!(s.contains("@@ -0,0 +1,2 @@"));
        assert!(s.contains("+line one\n"));
        assert!(s.contains("+line two\n"));
    }

    #[tokio::test]
    async fn synthesize_added_handles_empty_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = "empty.txt";
        std::fs::write(tmp.path().join(path), "").unwrap();
        let s = synthesize_added(tmp.path(), path).await.unwrap();
        assert!(s.contains("@@ -0,0 +1,1 @@"));
        assert!(s.ends_with("+\n"));
    }
}
