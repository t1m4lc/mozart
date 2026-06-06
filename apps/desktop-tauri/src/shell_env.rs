//! Augmented PATH for subprocesses spawned by a GUI-launched build.
//!
//! A Tauri app launched from the macOS Dock / a Linux `.desktop` entry
//! inherits launchd's (or systemd's) minimal PATH — `/usr/bin:/bin:…` —
//! NOT the PATH the user configured in `.zshrc` / `.bash_profile`. Any
//! subprocess we spawn that isn't itself an interactive shell then can't
//! find the tools the user installed — the `claude` agent (see
//! [`crate::claude_cli::bin_path`]) and the Run / Setup tab commands
//! (`npm run …`, `pnpm install`, …) — which surface as `command not
//! found: npm` / ENOENT even though they work in a terminal.
//!
//! [`augmented_path`] rebuilds the PATH from the process PATH + the user's
//! login+interactive shell PATH (queried once, cached, Unix only —
//! Windows GUI apps already inherit the full PATH from the registry) +
//! well-known install dirs.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Process PATH ++ login-shell PATH ++ well-known install dirs, deduped,
/// preserving discovery order (process entries win on collision).
pub fn augmented_path() -> OsString {
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

    std::env::join_paths(&dirs).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

/// The PATH a login+interactive shell exports, queried once and cached.
/// Interactive (`-i`) so it sources `.zshrc` / `.bashrc` where version
/// managers (nvm, asdf) and most users actually put their PATH. `None`
/// when there is no `$SHELL`, the query times out, or it fails — callers
/// fall back to the process PATH + [`known_install_dirs`].
#[cfg(unix)]
fn login_shell_path() -> Option<OsString> {
    static CACHE: OnceLock<Option<OsString>> = OnceLock::new();
    CACHE.get_or_init(query_login_shell_path).clone()
}

#[cfg(unix)]
fn query_login_shell_path() -> Option<OsString> {
    let shell = std::env::var_os("SHELL").filter(|s| !s.is_empty())?;
    // `-i -l` sources the interactive + login profiles that set PATH;
    // `-c` runs once and exits (no stdin wait). Interactive shells may
    // print job-control / prompt noise to stderr — we read stdout only.
    // A 3s timeout guards against a slow / hanging profile.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let out = std::process::Command::new(&shell)
            .arg("-ilc")
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

/// Well-known dirs CLIs land in, appended so a fresh GUI launch resolves
/// them even before the login-shell query lands.
fn known_install_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = home_dir() {
        dirs.push(home.join(".local/bin")); // claude native installer, pipx, …
        dirs.push(home.join(".claude/local")); // `claude migrate-installer`
        dirs.push(home.join(".npm-global/bin"));
        dirs.push(home.join(".bun/bin"));
        dirs.push(home.join(".volta/bin"));
        dirs.push(home.join(".yarn/bin"));
        dirs.push(home.join(".cargo/bin"));
        // nvm-managed Node installs (`~/.nvm/versions/node/<version>/bin`).
        // The login-shell query usually surfaces the active version, but when
        // it times out on a slow profile we'd otherwise miss claude/codex
        // installed via npm under nvm. Append every installed version's bin so
        // discovery still succeeds; the shared `~/.codex` / `~/.claude` session
        // means any version's CLI reports the same auth.
        dirs.extend(nvm_node_bins(&home));
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

/// `~/.nvm/versions/node/<version>/bin` for every installed Node version,
/// sorted descending so the lexically-highest version is tried first. Empty
/// when nvm isn't installed. Best-effort: unreadable dirs are skipped.
fn nvm_node_bins(home: &Path) -> Vec<PathBuf> {
    let root = home.join(".nvm/versions/node");
    let mut bins: Vec<PathBuf> = match std::fs::read_dir(&root) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path().join("bin"))
            .filter(|p| p.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    };
    bins.sort();
    bins.reverse();
    bins
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
}
