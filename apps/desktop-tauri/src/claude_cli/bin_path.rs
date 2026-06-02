//! Resolve the `claude` executable for GUI-launched builds.
//!
//! A Tauri app launched from the macOS Dock / a Linux `.desktop` entry
//! inherits launchd's (or systemd's) minimal PATH — `/usr/bin:/bin:…` —
//! NOT the PATH the user configured in `.zshrc` / `.bash_profile`. The
//! `claude` CLI almost always lives somewhere only the login shell knows
//! about (`~/.local/bin`, a Homebrew prefix, an nvm / volta / bun shim),
//! so a bare `Command::new("claude")` fails with ENOENT even though it
//! runs fine in a terminal. That is the exact onboarding-works /
//! agent-run-fails split: onboarding's `claude login` PTY goes through
//! `$SHELL` (terminal.rs), agent runs spawn the binary directly.
//!
//! [`resolve`] walks the process PATH, the user's *login-shell* PATH
//! (cached, Unix only — Windows GUI apps already inherit the full PATH
//! from the registry), and a set of well-known install dirs, then returns
//! the absolute path to `claude` plus the augmented PATH to hand the
//! child so `claude`'s own helpers (node, git, ripgrep) resolve too.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Test override: when `MOZART_CLAUDE_BIN` is set, callers use it verbatim
/// and all PATH discovery is skipped (mirrors the long-standing seam the
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
    let path_env = augmented_path();
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

/// Process PATH ++ login-shell PATH ++ well-known install dirs, deduped,
/// preserving discovery order (process entries win on collision).
fn augmented_path() -> OsString {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    let mut push = |dir: PathBuf| {
        if seen.insert(dir.clone()) {
            dirs.push(dir);
        }
    };

    if let Some(p) = std::env::var_os("PATH") {
        std::env::split_paths(&p).for_each(&mut push);
    }
    #[cfg(unix)]
    if let Some(p) = login_shell_path() {
        std::env::split_paths(&p).for_each(&mut push);
    }
    known_install_dirs().into_iter().for_each(push);

    std::env::join_paths(&dirs)
        .unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

/// The PATH a login shell exports, queried once and cached. Catches
/// installs the static dir list can't know about (nvm, asdf, a custom
/// prefix). `None` when there is no `$SHELL`, the query times out, or it
/// fails — callers fall back to the process PATH + [`known_install_dirs`].
#[cfg(unix)]
fn login_shell_path() -> Option<OsString> {
    static CACHE: OnceLock<Option<OsString>> = OnceLock::new();
    CACHE.get_or_init(query_login_shell_path).clone()
}

#[cfg(unix)]
fn query_login_shell_path() -> Option<OsString> {
    let shell = std::env::var_os("SHELL").filter(|s| !s.is_empty())?;
    // `-l` sources the profile that sets PATH. We avoid `-i` (interactive)
    // because configs that expect a tty can hang. `printf` keeps stdout to
    // exactly the PATH with no shell banner.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let out = std::process::Command::new(&shell)
            .arg("-lc")
            .arg(r#"printf '%s' "$PATH""#)
            .output();
        let _ = tx.send(out);
    });
    let out = rx
        .recv_timeout(std::time::Duration::from_secs(3))
        .ok()?
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout);
    let trimmed = path.trim();
    (!trimmed.is_empty()).then(|| OsString::from(trimmed))
}

/// Well-known dirs `claude` installers drop the binary into, appended so a
/// fresh GUI launch finds it even before the login-shell query lands.
fn known_install_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home_dir() {
        dirs.push(home.join(".local/bin")); // official native installer
        dirs.push(home.join(".claude/local")); // `claude migrate-installer`
        dirs.push(home.join(".npm-global/bin"));
        dirs.push(home.join(".bun/bin"));
        dirs.push(home.join(".volta/bin"));
        dirs.push(home.join(".yarn/bin"));
    }
    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs.push(PathBuf::from("/usr/local/bin"));
    }
    dirs
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
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

    #[test]
    fn augmented_path_includes_process_path_entries() {
        let augmented = augmented_path();
        let entries: Vec<PathBuf> = std::env::split_paths(&augmented).collect();
        if let Some(p) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&p) {
                assert!(
                    entries.contains(&dir),
                    "augmented PATH dropped process entry {dir:?}"
                );
            }
        }
    }

    #[test]
    fn augmented_path_appends_known_install_dirs() {
        let augmented = augmented_path();
        let entries: Vec<PathBuf> = std::env::split_paths(&augmented).collect();
        for dir in known_install_dirs() {
            assert!(
                entries.contains(&dir),
                "augmented PATH missing known install dir {dir:?}"
            );
        }
    }

    #[test]
    fn resolve_honors_bin_override() {
        // Serialized implicitly by being the only test that touches the
        // var; uses a path guaranteed not to need discovery.
        std::env::set_var(BIN_OVERRIDE_ENV, "/tmp/mock-claude");
        let resolved = resolve();
        std::env::remove_var(BIN_OVERRIDE_ENV);
        assert_eq!(resolved.program, OsString::from("/tmp/mock-claude"));
    }

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
