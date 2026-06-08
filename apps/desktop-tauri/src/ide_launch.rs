//! IDE detection + launch for Phase 4f's "Open in IDE" menu.
//!
//! Detection probes `which <binary>` style lookups via the platform
//! layer. Launch spawns the detected binary with the workspace's worktree
//! path. The system file manager and a "copy path" are also exposed (the
//! latter is a no-op Rust-side; the front-end handles clipboard).
//!
//! All process spawning goes through [`crate::platform`] so the
//! Windows no-console-window behavior is centralized. The one
//! intentionally visible path is `terminal`, which calls
//! [`crate::platform::open_in_terminal`].

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::platform::{open_in_terminal, resolve_executable, spawn_background};

/// Stable IDs the front-end pins behaviors to. Keep in lock-step with
/// `OPEN_IN_TOOLS` on the Angular side.
const KNOWN_IDES: &[(&str, &str)] = &[
    // (id, binary)
    ("vscode", "code"),
    ("cursor", "cursor"),
    ("windsurf", "windsurf"),
    ("zed", "zed"),
    ("sublime", "subl"),
    ("intellij", "idea"),
    ("webstorm", "webstorm"),
    ("pycharm", "pycharm"),
];

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DetectedIde {
    /// Stable identifier (e.g. `"vscode"`).
    pub id: String,
    /// Resolved absolute binary path (informational).
    pub binary_path: String,
}

/// Probe each known IDE binary on `$PATH`. Returns the subset that
/// resolved. The platform file manager (`finder`) is NOT in this list —
/// it's always available and surfaced separately by the front-end.
pub fn detect_installed_ides() -> Vec<DetectedIde> {
    let mut out = Vec::new();
    for (id, binary) in KNOWN_IDES {
        if let Some(path) = resolve_executable(binary) {
            out.push(DetectedIde {
                id: (*id).to_string(),
                binary_path: path.to_string_lossy().into_owned(),
            });
        }
    }
    out
}

/// Launch `id` against `path`. Most IDs map to a binary spawn;
/// `finder` opens the platform file manager ; `terminal` opens the
/// platform's default terminal emulator with `cwd` set to `path`.
pub fn open_in_ide(id: &str, path: &Path) -> Result<(), AppError> {
    if id == "finder" {
        return open_in_file_manager(path);
    }
    if id == "terminal" {
        return open_in_terminal(path);
    }
    let binary = match KNOWN_IDES.iter().find(|(known, _)| *known == id) {
        Some((_, bin)) => *bin,
        None => return Err(AppError::Validation(format!("unknown ide id: {id}"))),
    };
    // Resolve to the real executable so Windows `.cmd` launchers (e.g.
    // `code.cmd`) are found and don't flash a console.
    let program = resolve_executable(binary)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| binary.to_string());
    spawn_background(&program, &[path.as_os_str()], None)
}

fn open_in_file_manager(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    let bin = "open";
    #[cfg(target_os = "windows")]
    let bin = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))]
    let bin = "xdg-open";
    spawn_background(bin, &[path.as_os_str()], None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_in_ide_unknown_id_validates() {
        let err = open_in_ide("not-an-ide", Path::new("/")).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
