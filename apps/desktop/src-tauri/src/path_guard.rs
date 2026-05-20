//! Shared path validation for workspace-relative paths the agent / UI
//! hands to FS-touching IPC commands. P2.1.D extracts what was inline in
//! `read_workspace_file` so the read and save sites cannot drift.
//!
//! v0 enforces the same `workspace-relative, forward-slash` invariant
//! the existing file-tree and file-diff layers rely on:
//!
//! - non-empty
//! - no leading `/` (absolute paths rejected)
//! - no NUL bytes
//! - no `..` segments (traversal escapes rejected)
//!
//! The full canonicalize-and-confine guard (resolve symlinks, assert the
//! canonical form is under the worktree root) lives in plan atom P0.1.D
//! and supersedes this when it lands. For the dogfood path the regex-y
//! checks here line up with the existing `file_diff::validate_path` rule
//! and the inline rule that used to live in `read_workspace_file`.

use crate::error::AppError;

/// Reject workspace-relative paths that fail the invariants above. Use
/// this from any Tauri command that takes a path originating from the
/// UI or agent before opening a file on disk.
pub fn validate_workspace_relative_path(path: &str) -> Result<(), AppError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        let err = validate_workspace_relative_path("").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn rejects_absolute() {
        let err = validate_workspace_relative_path("/etc/hosts").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn rejects_nul() {
        let err = validate_workspace_relative_path("foo\0bar").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn rejects_traversal() {
        let err = validate_workspace_relative_path("../etc/hosts").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
        let err = validate_workspace_relative_path("nested/../../oops").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn accepts_nested_relative() {
        validate_workspace_relative_path("src/app/file.ts").unwrap();
        validate_workspace_relative_path("file.txt").unwrap();
    }
}
