//! IDE detection + launch for Phase 4f's "Open in IDE" menu.
//!
//! Detection probes `which <binary>` style lookups. Launch spawns the
//! detected binary with the workspace's worktree path. The system file
//! manager and a "copy path" are also exposed (the latter is a no-op
//! Rust-side; the front-end handles clipboard).

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

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
        if let Some(path) = which(binary) {
            out.push(DetectedIde {
                id: (*id).to_string(),
                binary_path: path,
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
    spawn_detached(binary, &[path.as_os_str()])
}

fn open_in_file_manager(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    let bin = "open";
    #[cfg(target_os = "windows")]
    let bin = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))]
    let bin = "xdg-open";
    spawn_detached(bin, &[path.as_os_str()])
}

/// Open the platform's default terminal at `path`.
///   - macOS  : `open -a Terminal <path>` (Terminal.app)
///   - Windows: Windows Terminal (`wt.exe -d <path>`), falls back to
///     `cmd /K cd /D <path>` when `wt` isn't on PATH.
///   - Linux  : tries common terminal emulators in order, using each
///     one's working-directory flag. Returns the first that spawns.
fn open_in_terminal(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        return spawn_detached("open", &["-a".as_ref(), "Terminal".as_ref(), path.as_os_str()]);
    }
    #[cfg(target_os = "windows")]
    {
        if which("wt.exe").is_some() {
            return spawn_detached("wt.exe", &["-d".as_ref(), path.as_os_str()]);
        }
        let cd_cmd = format!("cd /D \"{}\"", path.display());
        return spawn_detached(
            "cmd.exe",
            &[
                "/C".as_ref(),
                "start".as_ref(),
                "cmd".as_ref(),
                "/K".as_ref(),
                cd_cmd.as_ref(),
            ],
        );
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // (binary, working-directory flag style)
        //   "=" → emitted as a single arg `--flag=PATH`
        //   " " → emitted as two args `--flag PATH`
        #[allow(clippy::type_complexity)]
        let candidates: &[(&str, &str, &str)] = &[
            ("gnome-terminal", "--working-directory", "="),
            ("konsole", "--workdir", " "),
            ("xfce4-terminal", "--working-directory", "="),
            ("kitty", "--directory", " "),
            ("alacritty", "--working-directory", " "),
            ("tilix", "--working-directory", "="),
            ("terminator", "--working-directory", "="),
            ("x-terminal-emulator", "", ""),
            ("xterm", "", ""),
        ];
        for (bin, flag, sep) in candidates {
            if which(bin).is_none() {
                continue;
            }
            return if flag.is_empty() {
                Command::new(bin)
                    .current_dir(path)
                    .spawn()
                    .map_err(|e| AppError::Io(format!("spawn {bin}: {e}")))
                    .map(|_| ())
            } else if *sep == "=" {
                let arg = format!("{flag}={}", path.display());
                spawn_detached(bin, &[arg.as_ref()])
            } else {
                spawn_detached(bin, &[flag.as_ref(), path.as_os_str()])
            };
        }
        Err(AppError::Io(
            "no terminal emulator found on PATH (gnome-terminal, konsole, kitty, alacritty, xterm, …)".to_string(),
        ))
    }
}

fn spawn_detached(binary: &str, args: &[&std::ffi::OsStr]) -> Result<(), AppError> {
    Command::new(binary)
        .args(args)
        .spawn()
        .map_err(|e| AppError::Io(format!("spawn {binary}: {e}")))?;
    Ok(())
}

/// Plain-Rust `which` — walks `$PATH` for an executable named
/// `binary` (with platform extensions on Windows). Returns the first
/// match's absolute path.
fn which(binary: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    let exts: &[&str] = if cfg!(windows) {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(&path_var) {
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

    #[test]
    fn which_finds_sh_on_unix() {
        if cfg!(unix) {
            // /bin/sh is virtually always present on unix CI.
            assert!(which("sh").is_some());
        }
    }

    #[test]
    fn which_returns_none_for_definitely_missing() {
        assert!(which("definitely-not-a-real-binary-zxcv").is_none());
    }

    #[test]
    fn open_in_ide_unknown_id_validates() {
        let err = open_in_ide("not-an-ide", Path::new("/")).unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
