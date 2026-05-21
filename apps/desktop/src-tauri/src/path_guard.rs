//! Shared path validation for workspace-relative paths the agent / UI
//! hands to FS-touching IPC commands.
//!
//! Two layers:
//!
//! 1. [`validate_workspace_relative_path`] — cheap regex-y first line:
//!    non-empty, no leading `/`, no NUL bytes, no `..` segments. Same
//!    invariant as the file-tree and file-diff layers. Used as a fast
//!    pre-check.
//!
//! 2. [`validate_agent_path`] (P0.1 S0.1.D) — the load-bearing
//!    boundary: resolves the input against the workspace worktree,
//!    canonicalizes (which dereferences symlinks), and asserts the
//!    canonical form lives under the workspace's sandbox-level
//!    allowed roots. Callers feed the roots via
//!    [`resolve_allowed_roots`] so the validator stays pure / sync.
//!
//! Together: layer 1 catches obvious garbage fast; layer 2 closes the
//! symlink-escape bypass the v0 stub couldn't see. Both are run from
//! every Tauri command that handles a path originating from the agent
//! or UI.

use std::path::{Path, PathBuf};
use std::str::FromStr;

use rusqlite::Connection;

use crate::claude_cli::sandbox_policy::SandboxLevel;
use crate::db::models::Workspace;
use crate::db::{tasks, workspaces};
use crate::error::AppError;
use crate::sandbox;

/// Reject workspace-relative paths that fail the cheap invariants:
/// non-empty, no leading `/`, no NUL bytes, no `..` segments. Pair
/// with [`validate_agent_path`] at every command boundary.
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

/// Resolve the canonical filesystem roots a workspace is allowed to
/// touch at its current [`SandboxLevel`]. Mirrors `runner.rs`'s
/// `resolve_sandbox_roots` for argv assembly, but returns the union
/// of the allowed paths (whatever fits the level) already
/// canonicalized so `validate_agent_path` can do a fast prefix
/// match.
///
/// - `L1Mozart`   → `[~/.mozart/worktrees, ~/.mozart/projects]`
/// - `L2Project`  → sibling worktrees from
///   [`workspaces::list_active_siblings_for_project`], force-includes
///   the active worktree (mirrors the runner). Capped at 20 per CG-1.
/// - `L3Workspace`→ `[workspace.worktree_path]`
///
/// Each root is canonicalized so the validator can dereference
/// symlinks consistently against the same baseline. A root that
/// fails to canonicalize (e.g. legacy DB entry pointing at a removed
/// worktree) is silently skipped rather than turning every command
/// into an error — the goal is to never *widen* the sandbox, not to
/// brick the workspace.
pub fn resolve_allowed_roots(
    workspace: &Workspace,
    conn: &Connection,
) -> Result<Vec<PathBuf>, AppError> {
    let level =
        SandboxLevel::from_str(&workspace.sandbox_level).unwrap_or(SandboxLevel::DEFAULT);
    let raw: Vec<PathBuf> = match level {
        SandboxLevel::L1Mozart => vec![
            sandbox::canonical_worktrees_root()?,
            sandbox::canonical_projects_root()?,
        ],
        SandboxLevel::L2Project => {
            let task = tasks::get(conn, &workspace.task_id)?;
            let mut siblings =
                workspaces::list_active_siblings_for_project(conn, &task.repo_id, 20)?;
            if !siblings
                .iter()
                .any(|w| w.workspace_id == workspace.workspace_id)
            {
                siblings.insert(0, workspace.clone());
                siblings.truncate(20);
            }
            siblings.into_iter().map(|w| PathBuf::from(w.worktree_path)).collect()
        }
        SandboxLevel::L3Workspace => vec![PathBuf::from(&workspace.worktree_path)],
    };
    Ok(raw
        .into_iter()
        .filter_map(|p| std::fs::canonicalize(&p).ok())
        .collect())
}

/// Reject paths that, after canonicalization, fall outside the
/// allowed root set. Pure function — IO is limited to the
/// `canonicalize` call (which the symlink-escape defense needs) and
/// a single `parent().canonicalize()` fallback for not-yet-created
/// files (e.g. `file_save` writing a brand-new path).
///
/// Returns the resolved canonical path on success — callers can use
/// it directly for the open/read/write instead of re-resolving.
///
/// `level_label` is included in the [`AppError::PathRefused`] payload
/// so the frontend toast can name the sandbox level. Callers pass
/// `workspace.sandbox_level` straight through.
pub fn validate_agent_path(
    input: &Path,
    workspace_worktree: &Path,
    allowed_roots: &[PathBuf],
    level_label: &str,
) -> Result<PathBuf, AppError> {
    let absolute = if input.is_absolute() {
        input.to_path_buf()
    } else {
        workspace_worktree.join(input)
    };

    // Two-pass canonicalize: first try the full path (existing file),
    // then fall back to canonicalizing the parent + appending the
    // file name (file-to-be-created flow used by file_save). Either
    // pass produces a canonical path with symlinks resolved.
    let canonical = match std::fs::canonicalize(&absolute) {
        Ok(p) => p,
        Err(_) => {
            let parent = absolute
                .parent()
                .ok_or_else(|| AppError::Validation(format!("path has no parent: {absolute:?}")))?;
            let file_name = absolute.file_name().ok_or_else(|| {
                AppError::Validation(format!("path has no file name: {absolute:?}"))
            })?;
            std::fs::canonicalize(parent)
                .map_err(|e| AppError::Io(format!("canonicalize parent of {absolute:?}: {e}")))?
                .join(file_name)
        }
    };

    if allowed_roots
        .iter()
        .any(|root| canonical.starts_with(root))
    {
        Ok(canonical)
    } else {
        Err(AppError::PathRefused(format!(
            "{} not in {} sandbox",
            canonical.display(),
            level_label
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------
    // v0 (cheap regex) guard — unchanged from S0.1.B
    // -----------------------------------------------------------------

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

    // -----------------------------------------------------------------
    // P0.1 S0.1.D — validate_agent_path
    // -----------------------------------------------------------------

    use std::fs;
    use tempfile::TempDir;

    /// Build a (workspace_worktree, allowed_roots) pair from a tempdir.
    /// The allowed-roots list is what L3Workspace would produce after
    /// canonicalization — sufficient for most tests.
    fn make_l3_fixture() -> (TempDir, PathBuf, Vec<PathBuf>) {
        let dir = TempDir::new().unwrap();
        let worktree = fs::canonicalize(dir.path()).unwrap();
        let allowed = vec![worktree.clone()];
        (dir, worktree, allowed)
    }

    #[test]
    fn validate_agent_path_happy_path_nested_relative() {
        let (_keep, worktree, allowed) = make_l3_fixture();
        let nested_dir = worktree.join("src/app");
        fs::create_dir_all(&nested_dir).unwrap();
        let target = nested_dir.join("file.ts");
        fs::write(&target, b"hi").unwrap();

        let canonical = validate_agent_path(
            Path::new("src/app/file.ts"),
            &worktree,
            &allowed,
            "L3Workspace",
        )
        .unwrap();
        assert_eq!(canonical, fs::canonicalize(&target).unwrap());
    }

    #[test]
    fn validate_agent_path_rejects_traversal_via_canonicalize() {
        let (_keep, worktree, allowed) = make_l3_fixture();
        // `..` traversal that, after canonicalize, escapes the worktree.
        // The v0 layer also catches this, but the canonicalize check is
        // the load-bearing security boundary.
        let err = validate_agent_path(
            Path::new("../outside"),
            &worktree,
            &allowed,
            "L3Workspace",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::PathRefused { .. }));
    }

    #[test]
    #[cfg(unix)]
    fn validate_agent_path_rejects_symlink_escape() {
        // The classic symlink-escape attack: symlink inside the
        // worktree pointing at an outside dir. The v0 regex guard
        // misses this (no `..`, no leading `/`); only the canonicalize
        // step catches it. This is the regression the spec calls out.
        let outside = TempDir::new().unwrap();
        let outside_canon = fs::canonicalize(outside.path()).unwrap();
        let (_keep, worktree, allowed) = make_l3_fixture();
        let escape = worktree.join("escape");
        std::os::unix::fs::symlink(&outside_canon, &escape).unwrap();

        let err = validate_agent_path(
            Path::new("escape"),
            &worktree,
            &allowed,
            "L3Workspace",
        )
        .unwrap_err();
        match err {
            AppError::PathRefused(msg) => {
                assert!(
                    msg.contains("L3Workspace"),
                    "message must name the level, got: {msg}"
                );
                let outside_str = outside_canon.to_string_lossy();
                assert!(
                    msg.contains(outside_str.as_ref()),
                    "message must spell out the canonical target ({outside_str}), got: {msg}"
                );
            }
            other => panic!("expected PathRefused, got {other:?}"),
        }
    }

    #[test]
    #[cfg(unix)]
    fn validate_agent_path_rejects_symlink_chain_to_outside() {
        // Two-hop symlink: `escape` → `hop` → outside dir. Canonicalize
        // follows the full chain so the rejection still fires.
        let outside = TempDir::new().unwrap();
        let outside_canon = fs::canonicalize(outside.path()).unwrap();
        let (_keep, worktree, allowed) = make_l3_fixture();
        let hop = worktree.join("hop");
        let escape = worktree.join("escape");
        std::os::unix::fs::symlink(&outside_canon, &hop).unwrap();
        std::os::unix::fs::symlink(&hop, &escape).unwrap();

        let err = validate_agent_path(
            Path::new("escape"),
            &worktree,
            &allowed,
            "L3Workspace",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::PathRefused { .. }));
    }

    #[test]
    fn validate_agent_path_l3_rejects_sibling_worktree() {
        // L3 only allows this workspace's worktree. A path under a
        // sibling worktree must be refused even though L2 would
        // accept it.
        let (_keep_a, ws_a, _) = make_l3_fixture();
        let (_keep_b, ws_b, _) = make_l3_fixture();
        let target = ws_b.join("file.txt");
        fs::write(&target, b"sibling").unwrap();

        let err = validate_agent_path(
            &target,
            &ws_a,
            &[ws_a.clone()], // L3 — only ws_a is allowed
            "L3Workspace",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::PathRefused { .. }));
    }

    #[test]
    fn validate_agent_path_l2_accepts_sibling_worktree() {
        // Same fixture as the L3 test above, but the allowed set
        // includes ws_b — mimics L2 where sibling workspaces share
        // visibility. Must succeed.
        let (_keep_a, ws_a, _) = make_l3_fixture();
        let (_keep_b, ws_b, _) = make_l3_fixture();
        let target = ws_b.join("file.txt");
        fs::write(&target, b"sibling").unwrap();

        let canonical = validate_agent_path(
            &target,
            &ws_a,
            &[ws_a.clone(), ws_b.clone()],
            "L2Project",
        )
        .unwrap();
        assert_eq!(canonical, fs::canonicalize(&target).unwrap());
    }

    #[test]
    fn validate_agent_path_accepts_nonexistent_file_with_existing_parent() {
        // file_save creating a new file: target doesn't exist yet,
        // parent does. Two-pass canonicalize should succeed.
        let (_keep, worktree, allowed) = make_l3_fixture();
        let parent = worktree.join("new-dir");
        fs::create_dir(&parent).unwrap();

        let canonical = validate_agent_path(
            Path::new("new-dir/will-be-created.txt"),
            &worktree,
            &allowed,
            "L3Workspace",
        )
        .unwrap();
        assert_eq!(canonical, parent.join("will-be-created.txt"));
    }

    #[test]
    fn validate_agent_path_rejects_etc_anywhere() {
        // Any level: `/etc/passwd` is never in scope. Use an empty
        // allowed-roots set to confirm rejection regardless of level.
        let (_keep, worktree, _) = make_l3_fixture();
        let err = validate_agent_path(
            Path::new("/etc/passwd"),
            &worktree,
            &[worktree.clone()],
            "L3Workspace",
        )
        .unwrap_err();
        assert!(matches!(err, AppError::PathRefused { .. }));
    }
}
