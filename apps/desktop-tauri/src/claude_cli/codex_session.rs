//! Probe for an authenticated `codex` session by asking the CLI itself —
//! Codex's parallel to [`crate::claude_cli::session`].
//!
//! We run `codex login status` and read its output rather than inspecting
//! credential files, so the check tracks the CLI's own source of truth
//! regardless of where it stores credentials. Codex has no `--json` mode
//! here, so we match its text. The binary is resolved against the
//! login-shell PATH (see [`crate::claude_cli::bin_path`]).

use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

/// Returns true iff `codex login status` reports an authenticated session.
/// Any failure mode — binary missing, spawn error, timeout, unrecognized
/// output — collapses to `false`.
pub async fn has_session() -> bool {
    let bin = super::bin_path::resolve_codex();
    let fut = Command::new(&bin.program)
        .args(["login", "status"])
        .env("PATH", &bin.path_env)
        .output();

    match timeout(Duration::from_secs(5), fut).await {
        Ok(Ok(out)) => parse_logged_in(&String::from_utf8_lossy(&out.stdout)),
        _ => false,
    }
}

/// Recognize the "logged in" line from `codex login status` (e.g. "Logged in
/// using ChatGPT") while rejecting the "Not logged in" case. Tolerant of
/// wording changes around that core phrase.
pub(crate) fn parse_logged_in(stdout: &str) -> bool {
    let s = stdout.to_ascii_lowercase();
    s.contains("logged in") && !s.contains("not logged in")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_logged_in() {
        assert!(parse_logged_in("Logged in using ChatGPT\n"));
        assert!(parse_logged_in("Logged in using an API key"));
    }

    #[test]
    fn rejects_not_logged_in() {
        assert!(!parse_logged_in("Not logged in"));
        assert!(!parse_logged_in("not logged in\n"));
    }

    #[test]
    fn false_when_empty_or_unrelated() {
        assert!(!parse_logged_in(""));
        assert!(!parse_logged_in("error: command failed"));
    }
}
