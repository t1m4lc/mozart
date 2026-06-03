//! Lightweight probe for a `codex login` session — Codex's parallel to
//! [`crate::claude_cli::session`].
//!
//! The Codex CLI writes its credential bundle to `~/.codex/auth.json` after
//! a successful `codex login` (ChatGPT OAuth or stored API key). The file's
//! *presence* is the heuristic; validating the session would mean parsing an
//! undocumented schema or invoking `codex`, both heavier than this
//! affordance warrants. A missing file falls the user through to the
//! API-key dialog.

use std::path::{Path, PathBuf};

/// Returns true iff a `codex login` credential file is present in the
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
    home.join(".codex").join("auth.json").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_false_when_dotcodex_missing() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!has_session_in(tmp.path()));
    }

    #[test]
    fn returns_false_when_auth_json_missing() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".codex")).unwrap();
        assert!(!has_session_in(tmp.path()));
    }

    #[test]
    fn returns_true_when_auth_json_present() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".codex");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("auth.json"), "{}").unwrap();
        assert!(has_session_in(tmp.path()));
    }

    #[test]
    fn returns_false_when_auth_path_is_a_directory() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".codex/auth.json")).unwrap();
        assert!(!has_session_in(tmp.path()));
    }
}
