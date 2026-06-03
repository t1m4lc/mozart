//! Detect whether the Anthropic `claude` CLI is installed and reachable.
//!
//! Surface is intentionally tiny: a binary "installed vs missing" answer plus a
//! best-effort version string. Any failure mode (spawn error, non-zero exit,
//! timeout, empty stdout) collapses to [`ClaudeInstall::Missing`] — we never
//! propagate OS-level errors to callers (per atom S1.4.2 acceptance).
//!
//! Version parsing is factored into [`parse_version_stdout`] so the pure-string
//! branch is unit-testable without spawning a subprocess.

use std::time::Duration;

use serde::Serialize;
use tokio::process::Command;
use tokio::time::timeout;

/// Outcome of probing for the `claude` CLI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeInstall {
    Installed { version: String },
    Missing,
}

/// Best-effort parse of `claude --version` stdout.
///
/// Returns the trimmed stdout if non-empty, else `None`. We deliberately do
/// **not** validate semver shape (D1.4-I): if the CLI changes its banner we'd
/// rather surface whatever it printed than declare it "missing".
pub(crate) fn parse_version_stdout(stdout: &str) -> Option<String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Probe for the `claude` CLI by running `claude --version` with a 3-second
/// hard timeout.
///
/// All failure modes — spawn error, non-zero exit, timeout, empty stdout —
/// collapse to [`ClaudeInstall::Missing`]. Successful runs return the trimmed
/// stdout as the version string.
pub async fn check_installed() -> ClaudeInstall {
    // Resolve `claude` against the login-shell PATH — a GUI-launched build
    // inherits only launchd/systemd's minimal PATH, so a bare
    // `Command::new("claude")` would report Missing even when it is
    // installed (see crate::claude_cli::bin_path).
    check_bin(super::bin_path::resolve()).await
}

/// Codex's parallel to [`check_installed`] — probes `codex --version`.
/// Same failure-collapses-to-Missing contract.
pub async fn check_codex_installed() -> ClaudeInstall {
    check_bin(super::bin_path::resolve_codex()).await
}

/// Run `<bin> --version` with a 3-second hard timeout and collapse every
/// failure mode to [`ClaudeInstall::Missing`]. Shared by the `claude` and
/// `codex` probes.
async fn check_bin(bin: super::bin_path::ResolvedBin) -> ClaudeInstall {
    let fut = Command::new(&bin.program)
        .arg("--version")
        .env("PATH", &bin.path_env)
        .output();

    let output = match timeout(Duration::from_secs(3), fut).await {
        Ok(Ok(out)) => out,
        // spawn error or timeout — both treated as Missing
        Ok(Err(_)) | Err(_) => return ClaudeInstall::Missing,
    };

    if !output.status.success() {
        return ClaudeInstall::Missing;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    match parse_version_stdout(&stdout) {
        Some(version) => ClaudeInstall::Installed { version },
        None => ClaudeInstall::Missing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_stdout_strips_trailing_newline() {
        assert_eq!(
            parse_version_stdout("2.1.138\n"),
            Some("2.1.138".to_string())
        );
    }

    #[test]
    fn parse_version_stdout_returns_none_for_empty_or_whitespace() {
        assert_eq!(parse_version_stdout(""), None);
        assert_eq!(parse_version_stdout("   \n"), None);
        assert_eq!(parse_version_stdout("\t\t  "), None);
    }

    #[test]
    fn parse_version_stdout_does_not_validate_semver() {
        // Per D1.4-I we do not validate the shape — whatever the CLI prints
        // (after trimming) is returned as-is.
        assert_eq!(
            parse_version_stdout("claude 2.1.138-rc1 (build abcdef)\n"),
            Some("claude 2.1.138-rc1 (build abcdef)".to_string())
        );
    }

    // Timeout-branch coverage is intentionally omitted here:
    // `check_installed` invokes `Command::new("claude")` directly, so exercising
    // the timeout path would require either (a) PATH-juggling in the test, or
    // (b) introducing a command-builder injection seam. Both are outside this
    // atom's scope (S1.4.2 forbids touching Cargo.toml / lib.rs / runner.rs),
    // and the parsing helper above gives us deterministic coverage of the only
    // non-trivial pure-logic branch. The timeout branch is exercised in
    // practice via the Spike E pattern referenced in the plan.
}
