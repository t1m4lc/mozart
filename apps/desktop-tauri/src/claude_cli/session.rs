//! Lightweight probe for a `claude /login` session.
//!
//! The Claude Code CLI writes its credential bundle to
//! `~/.claude/.credentials.json` on Linux (and Windows via `%USERPROFILE%`).
//! The file's *presence* is treated as the heuristic — verifying that the
//! session is still valid would require either parsing the (undocumented)
//! credential schema or actually invoking `claude` to introspect, both of
//! which are heavier than this affordance warrants in v0.1.0-beta.1.
//!
//! macOS: Claude Code may keep credentials in the login Keychain rather
//! than the JSON file (the common case for Pro/Max). When the file is
//! absent we fall back to a Keychain existence probe so already-signed-in
//! users skip the `claude login` terminal entirely.

use std::path::{Path, PathBuf};

/// Service name under which the Claude Code CLI stores its credential
/// item in the macOS login Keychain.
#[cfg(target_os = "macos")]
const CLAUDE_KEYCHAIN_SERVICE: &str = "Claude Code-credentials";

/// Returns true iff a `claude /login` session is detectable — the
/// `~/.claude/.credentials.json` file on any platform, or (macOS only)
/// the credential item in the login Keychain.
pub fn has_session() -> bool {
    if let Some(home) = home_dir() {
        if has_session_in(&home) {
            return true;
        }
    }
    #[cfg(target_os = "macos")]
    {
        return has_keychain_session();
    }
    #[cfg(not(target_os = "macos"))]
    false
}

/// Existence-only probe of the login Keychain. Omitting `-w` returns the
/// item's metadata without reading the secret, so it does not raise a
/// Keychain authorization prompt. Exit 0 = present, 44 = not found.
#[cfg(target_os = "macos")]
fn has_keychain_session() -> bool {
    std::process::Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", CLAUDE_KEYCHAIN_SERVICE])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Testable seam — checks the credential file inside an arbitrary home.
fn has_session_in(home: &Path) -> bool {
    home.join(".claude").join(".credentials.json").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_false_when_dotclaude_missing() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!has_session_in(tmp.path()));
    }

    #[test]
    fn returns_false_when_credentials_json_missing() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude")).unwrap();
        assert!(!has_session_in(tmp.path()));
    }

    #[test]
    fn returns_true_when_credentials_json_present() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".claude");
        std::fs::create_dir_all(&dir).unwrap();
        // Content is irrelevant — the heuristic is presence only.
        std::fs::write(dir.join(".credentials.json"), "{}").unwrap();
        assert!(has_session_in(tmp.path()));
    }

    #[test]
    fn returns_false_when_credentials_path_is_a_directory() {
        // Guard against a stale `~/.claude/.credentials.json/` directory
        // (e.g. an over-eager `mkdir -p`); `is_file()` filters this out.
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude/.credentials.json")).unwrap();
        assert!(!has_session_in(tmp.path()));
    }
}
