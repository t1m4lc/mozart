//! Resolve the `claude` executable for GUI-launched builds.
//!
//! A Tauri app launched from the macOS Dock / a Linux `.desktop` entry
//! inherits launchd's (or systemd's) minimal PATH, NOT the PATH the user
//! configured in their shell profile. The `claude` CLI almost always lives
//! somewhere only the login shell knows about (`~/.local/bin`, a Homebrew
//! prefix, an nvm / volta / bun shim), so a bare `Command::new("claude")`
//! fails with ENOENT even though it runs fine in a terminal — the exact
//! onboarding-works / agent-run-fails split (onboarding's `claude login`
//! PTY goes through `$SHELL`, agent runs spawn the binary directly).
//!
//! [`resolve`] walks the augmented PATH from [`crate::shell_env`] and
//! returns the absolute path to `claude` plus that PATH, so callers can
//! hand it to the child for `claude`'s own helpers (node, git, ripgrep).

use std::ffi::OsString;
use std::path::Path;

use crate::shell_env;

/// Test override: when `MOZART_CLAUDE_BIN` is set, callers use it verbatim
/// and binary discovery is skipped (mirrors the long-standing seam the
/// runner / command tests rely on).
const BIN_OVERRIDE_ENV: &str = "MOZART_CLAUDE_BIN";

/// The resolved `claude` program plus the PATH the child should run with.
pub struct ResolvedBin {
    /// What to pass to `Command::new` — an absolute path when discovery
    /// succeeds, else the literal `"claude"` as a last-resort fallback.
    pub program: OsString,
    /// Augmented PATH to set on the child via `cmd.env("PATH", …)`.
    pub path_env: OsString,
}

/// Resolve `claude` for a child spawn. Honors `MOZART_CLAUDE_BIN` first.
pub fn resolve() -> ResolvedBin {
    let path_env = shell_env::augmented_path();
    if let Some(over) = std::env::var_os(BIN_OVERRIDE_ENV) {
        return ResolvedBin {
            program: over,
            path_env,
        };
    }
    let program = which("claude", &path_env)
        .map(OsString::from)
        .unwrap_or_else(|| OsString::from("claude"));
    ResolvedBin { program, path_env }
}

/// Plain-Rust `which` over an explicit PATH string. Returns the first
/// executable named `binary` (with platform extensions on Windows).
fn which(binary: &str, path_env: &OsString) -> Option<String> {
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(path_env) {
        for ext in exts {
            let candidate = if ext.is_empty() {
                dir.join(binary)
            } else {
                dir.join(format!("{binary}{ext}"))
            };
            if is_executable(&candidate) {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_executable(p: &Path) -> bool {
    p.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    // The `MOZART_CLAUDE_BIN` override is exercised end-to-end by the
    // runner / commands integration tests (they spawn the mock binary via
    // it); a unit test here would race those on the process-global env var.

    #[test]
    fn which_finds_sh_on_unix() {
        if cfg!(unix) {
            let path = std::env::var_os("PATH").unwrap_or_default();
            assert!(which("sh", &path).is_some());
        }
    }

    #[test]
    fn which_returns_none_for_missing_binary() {
        let path = std::env::var_os("PATH").unwrap_or_default();
        assert!(which("definitely-not-a-real-binary-zxcv", &path).is_none());
    }
}
