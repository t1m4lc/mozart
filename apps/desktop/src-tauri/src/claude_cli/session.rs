//! Lightweight probe for a `claude /login` session.
//!
//! The Claude Code CLI writes its credential bundle to
//! `~/.claude/.credentials.json` on Linux (and Windows via `%USERPROFILE%`).
//! The file's *presence* is treated as the heuristic — verifying that the
//! session is still valid would require either parsing the (undocumented)
//! credential schema or actually invoking `claude` to introspect, both of
//! which are heavier than this affordance warrants in v0.0.1.
//!
//! macOS limitation: Claude Code may also keep credentials in the macOS
//! Keychain rather than the JSON file. Mozart's heuristic returns false
//! in that case; the user falls through to the API-key dialog. A
//! Keychain probe is a follow-up.

use std::path::{Path, PathBuf};

/// Returns true iff a `claude /login` credential file is present in the
/// user's home directory.
pub fn has_session() -> bool {
    match home_dir() {
        Some(home) => has_session_in(&home),
        None => false,
    }
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
