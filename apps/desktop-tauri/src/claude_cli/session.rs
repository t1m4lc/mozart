//! Probe for an authenticated `claude` session by asking the CLI itself.
//!
//! We run `claude auth status --json` and read its `loggedIn` field rather
//! than inspecting credential files: the CLI's storage is undocumented and
//! backend-specific (a JSON file on Linux, the login Keychain on macOS, the
//! Credential Manager on Windows), so its own status command is the one
//! source of truth that stays correct across OSes and CLI updates. The
//! binary is resolved against the login-shell PATH so a GUI-launched build
//! still finds it (see [`crate::claude_cli::bin_path`]).

use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

/// Returns true iff `claude auth status` reports an authenticated session.
/// Any failure mode — binary missing, spawn error, timeout, unparseable
/// output — collapses to `false`, so the user simply falls through to the
/// login flow.
pub async fn has_session() -> bool {
    let bin = super::bin_path::resolve();
    let fut = Command::new(&bin.program)
        .args(["auth", "status", "--json"])
        .env("PATH", &bin.path_env)
        .output();

    match timeout(Duration::from_secs(5), fut).await {
        Ok(Ok(out)) => parse_logged_in(&String::from_utf8_lossy(&out.stdout)),
        // spawn error or timeout — treat as no session
        _ => false,
    }
}

/// Read the `loggedIn` boolean out of `claude auth status --json`. Tolerant:
/// returns `false` when the output is empty, not JSON, or lacks the field —
/// we never want a parse hiccup to look like a live session.
pub(crate) fn parse_logged_in(stdout: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(stdout)
        .ok()
        .and_then(|v| v.get("loggedIn").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_logged_in_true() {
        let json = r#"{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}"#;
        assert!(parse_logged_in(json));
    }

    #[test]
    fn parses_logged_in_false() {
        assert!(!parse_logged_in(r#"{"loggedIn":false}"#));
    }

    #[test]
    fn false_when_field_absent() {
        assert!(!parse_logged_in(r#"{"authMethod":"claude.ai"}"#));
    }

    #[test]
    fn false_when_empty_or_not_json() {
        assert!(!parse_logged_in(""));
        assert!(!parse_logged_in("Logged in as foo"));
        assert!(!parse_logged_in("{not json"));
    }
}
