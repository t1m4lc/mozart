//! Sandbox module — git-backed checkpoint / diff / reset operations on a
//! workspace's `worktree_path`.
//!
//! This module hosts three public async surfaces (added incrementally):
//! `git_checkpoint` (S1.5.1, this atom), `capture_diff` (S1.5.2) and
//! `discard_changes_to` (S1.5.3). All three call into a single
//! `run_git` helper (D1.5-K) so error mapping lives in one place.
//!
//! Locked decisions (plan §4):
//! - **D1.5-A / D1.5-B** — workspace + project root resolution lives in
//!   `crate::paths` (`workspaces_root` / `projects_root`), which honors
//!   `MOZART_WORKTREES_ROOT` first (test seam) then the OS-standard data
//!   dir. Failure → `Validation`.
//! - **D1.5-K** — `run_git` is the single source of truth for git
//!   invocation + stderr-passthrough error mapping. Spawn/wait failures
//!   become `AppError::Io(format!("git {args:?}: {e}"))`; non-zero exits
//!   become `AppError::GitCmd(format!("git {args:?} failed: {stderr}"))`.
//! - **D1.5-L** — `test_env_gate` is a single shared `OnceLock<Mutex<()>>`
//!   that all sandbox tests AND (post S1.5.4) the runner integration
//!   tests acquire before mutating `MOZART_*` env vars.

use std::path::Path;
use tokio::process::Command;

use crate::error::AppError;

pub mod checkpoint;
pub mod diff;
pub mod reset;

pub use checkpoint::git_checkpoint;
pub use diff::{capture_diff, DiffSummary};
pub use reset::discard_changes_to;

/// Single source of truth for git invocation + error mapping (D1.5-K).
///
/// Returns the captured stdout as a `String` on success. Spawn / wait
/// failure → `AppError::Io`. Non-zero exit → `AppError::GitCmd`
/// carrying `"git <args> failed: <stderr>"` (stderr trimmed).
pub(crate) async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, AppError> {
    let out = run_git_capture(cwd, args).await?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!("git {args:?} failed: {err}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Lower-level git invocation that returns the raw `Output`. Only errors
/// on spawn / wait failure (`AppError::Io`); non-zero exits are returned
/// to the caller for inspection. Useful when callers need to distinguish
/// expected failure modes (e.g. ref-existence probes) from real errors.
pub(crate) async fn run_git_capture(
    cwd: &Path,
    args: &[&str],
) -> Result<std::process::Output, AppError> {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| AppError::Io(format!("git {args:?}: {e}")))
}

/// Test-only: skip helper for tests that need a real `git` on PATH.
/// Mirrors `spikes/spike_a_worktree.rs:11-17`.
#[cfg(test)]
pub(crate) fn git_available() -> bool {
    std::process::Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Test-only: shared process-global gate (D1.5-L). Sandbox tests and
/// the runner integration tests (post S1.5.4) acquire this Mutex before
/// touching any `MOZART_*` env var so parallel `cargo test` runs don't
/// race each other on process-global state.
#[cfg(test)]
pub(crate) fn test_env_gate() -> &'static std::sync::Mutex<()> {
    use std::sync::OnceLock;
    static GATE: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| std::sync::Mutex::new(()))
}
