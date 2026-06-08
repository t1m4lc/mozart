//! Centralized OS-specific process + executable handling.
//!
//! The rule (RCA: `docs/tmp/2026-06-08-windows-process-spawn-rca.md`):
//! OS-specific spawn behavior is explicit, centralized, and testable.
//! Feature code calls these semantic helpers instead of branching on
//! `cfg!(windows)` inline.
//!
//! - Background commands set `CREATE_NO_WINDOW` on Windows so a
//!   GUI-subsystem build doesn't flash a console per child process. The
//!   ONE intentionally window-ful path is [`open_in_terminal`].
//! - [`resolve_executable`] is extension-aware so Windows `.cmd`/`.bat`
//!   shims (`npm`, `pnpm`, `yarn`, `code`) resolve.
//! - [`shell_command`] is shell-aware: `cmd.exe` uses `/C`, PowerShell
//!   `-Command`, POSIX shells `-c`.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

use crate::error::AppError;

/// Windows `CREATE_NO_WINDOW` process-creation flag. Suppresses the
/// console window the OS allocates when a GUI-subsystem process spawns a
/// console-subsystem child.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Apply "no console window" to a command builder. On Windows this sets
/// `CREATE_NO_WINDOW`; everywhere else it is a no-op (children never get a
/// window there). Implemented for both `std` and `tokio` command builders
/// so every background spawn site shares one call.
pub trait NoWindow {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindow for std::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

impl NoWindow for tokio::process::Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

// ---------------------------------------------------------------------------
// Executable resolution
// ---------------------------------------------------------------------------

/// Extensions tried when resolving a bare command name. On Windows the
/// shell resolves via `PATHEXT`; Rust's `Command` only auto-appends
/// `.exe`, so `.cmd`/`.bat` shims need explicit help. Real executables are
/// tried before the bare name so a `npm` shell-script (Git-Bash) doesn't
/// shadow `npm.cmd`.
#[cfg(windows)]
const EXECUTABLE_EXTS: &[&str] = &[".exe", ".cmd", ".bat", ".com", ""];
#[cfg(not(windows))]
const EXECUTABLE_EXTS: &[&str] = &[""];

/// Resolve `name` to an absolute executable path by walking `$PATH`,
/// trying Windows executable extensions. A value that is already a path
/// (absolute, or containing a separator) is probed directly. Returns
/// `None` if nothing resolves.
pub fn resolve_executable(name: &str) -> Option<PathBuf> {
    let raw = Path::new(name);
    if raw.is_absolute() || raw.components().count() > 1 {
        return resolve_with_exts(raw);
    }
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        if let Some(found) = resolve_with_exts(&dir.join(name)) {
            return Some(found);
        }
    }
    None
}

fn resolve_with_exts(base: &Path) -> Option<PathBuf> {
    for ext in EXECUTABLE_EXTS {
        let candidate = if ext.is_empty() {
            base.to_path_buf()
        } else {
            let mut s = base.as_os_str().to_owned();
            s.push(ext);
            PathBuf::from(s)
        };
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// True iff `name` resolves to an executable on `$PATH`.
pub fn command_available(name: &str) -> bool {
    resolve_executable(name).is_some()
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

// ---------------------------------------------------------------------------
// Package manager resolution
// ---------------------------------------------------------------------------

/// A resolved package manager for a worktree: the display name plus the
/// program to actually spawn (an absolute shim path on Windows).
pub struct PackageManager {
    /// `"pnpm" | "yarn" | "npm"` — for display / telemetry.
    pub name: &'static str,
    /// What to hand to `Command::new` — the resolved shim path when found
    /// (e.g. `…/npm.cmd` on Windows), else the bare name as a fallback.
    pub program: OsString,
}

/// Detect the package manager for `worktree` (lockfile precedence:
/// pnpm → yarn → npm; default npm when a `package.json` exists but no
/// lockfile). Returns `None` when there is no `package.json`. The chosen
/// manager's real executable is resolved via [`resolve_executable`] so
/// Windows `.cmd` shims work.
pub fn resolve_package_manager(worktree: &Path) -> Option<PackageManager> {
    if !worktree.join("package.json").exists() {
        return None;
    }
    let name = if worktree.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if worktree.join("yarn.lock").exists() {
        "yarn"
    } else {
        "npm"
    };
    let program = resolve_executable(name)
        .map(PathBuf::into_os_string)
        .unwrap_or_else(|| OsString::from(name));
    Some(PackageManager { name, program })
}

// ---------------------------------------------------------------------------
// Shell-aware one-shot command
// ---------------------------------------------------------------------------

/// A shell capable of running a one-shot command string and exiting.
pub enum Shell {
    /// Windows `cmd.exe` — runs a command with `/C`.
    Cmd,
    /// PowerShell — runs a command with `-Command`.
    PowerShell,
    /// A POSIX shell (bash/zsh/sh, incl. Git-Bash) — runs with `-c`.
    Posix(OsString),
}

impl Shell {
    /// The program to spawn.
    pub fn program(&self) -> OsString {
        match self {
            Shell::Cmd => OsString::from("cmd.exe"),
            Shell::PowerShell => OsString::from("powershell.exe"),
            Shell::Posix(p) => p.clone(),
        }
    }

    /// The flag that makes the shell run a single command string and exit.
    pub fn run_flag(&self) -> &'static str {
        match self {
            Shell::Cmd => "/C",
            Shell::PowerShell => "-Command",
            Shell::Posix(_) => "-c",
        }
    }
}

/// The user's default interactive shell. Honors `$SHELL` first (covers
/// Git-Bash / zsh on Windows too), then falls back to `cmd.exe` on Windows
/// / `/bin/bash` elsewhere.
pub fn default_shell() -> Shell {
    if let Some(sh) = std::env::var_os("SHELL").filter(|s| !s.is_empty()) {
        let lower = sh.to_string_lossy().to_ascii_lowercase();
        if lower.contains("powershell") || lower.contains("pwsh") {
            return Shell::PowerShell;
        }
        if lower.ends_with("cmd.exe") || lower.ends_with("\\cmd") {
            return Shell::Cmd;
        }
        return Shell::Posix(sh);
    }
    if cfg!(windows) {
        Shell::Cmd
    } else {
        Shell::Posix(OsString::from("/bin/bash"))
    }
}

/// A one-shot shell invocation: the shell program, the run flag, and the
/// command string. Shell-aware so the same `command` runs correctly under
/// `cmd.exe` (`/C`), PowerShell (`-Command`), or a POSIX shell (`-c`).
pub struct ShellInvocation {
    pub program: OsString,
    pub flag: &'static str,
    pub command: String,
}

/// Build a shell-aware one-shot invocation for `command`.
pub fn shell_command(command: &str) -> ShellInvocation {
    let shell = default_shell();
    ShellInvocation {
        program: shell.program(),
        flag: shell.run_flag(),
        command: command.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/// Fire-and-forget detached spawn of a background helper (IDE launcher,
/// file manager, …). Always applies [`NoWindow::no_window`], logs a
/// redacted diagnostic line, and does NOT wait. Spawn failure →
/// `AppError::Io`.
pub fn spawn_background(program: &str, args: &[&OsStr], cwd: Option<&Path>) -> Result<(), AppError> {
    log_spawn(program, args, cwd, "background");
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.no_window();
    cmd.spawn()
        .map_err(|e| AppError::Io(format!("spawn {program}: {e}")))?;
    Ok(())
}

/// Open the platform's default terminal emulator at `path`. This is the
/// ONE intentionally window-ful spawn path — it must stay visible, so it
/// deliberately does NOT apply `no_window`.
///   - macOS  : `open -a Terminal <path>`
///   - Windows: Windows Terminal (`wt.exe -d <path>`), else
///     `cmd /C start cmd /K cd /D <path>`
///   - Linux  : the first installed common terminal emulator, using its
///     working-directory flag.
pub fn open_in_terminal(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        return spawn_visible(
            "open",
            &["-a".as_ref(), "Terminal".as_ref(), path.as_os_str()],
            None,
        );
    }
    #[cfg(target_os = "windows")]
    {
        if command_available("wt.exe") {
            return spawn_visible("wt.exe", &["-d".as_ref(), path.as_os_str()], None);
        }
        let cd_cmd = format!("cd /D \"{}\"", path.display());
        return spawn_visible(
            "cmd.exe",
            &[
                "/C".as_ref(),
                "start".as_ref(),
                "cmd".as_ref(),
                "/K".as_ref(),
                cd_cmd.as_ref(),
            ],
            None,
        );
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // (binary, working-directory flag, separator style)
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
            if !command_available(bin) {
                continue;
            }
            return if flag.is_empty() {
                spawn_visible(bin, &[], Some(path))
            } else if *sep == "=" {
                let arg = format!("{flag}={}", path.display());
                spawn_visible(bin, &[arg.as_ref()], None)
            } else {
                spawn_visible(bin, &[flag.as_ref(), path.as_os_str()], None)
            };
        }
        Err(AppError::Io(
            "no terminal emulator found on PATH (gnome-terminal, konsole, kitty, alacritty, xterm, …)".to_string(),
        ))
    }
}

/// Visible (window-ful) detached spawn. Used only by [`open_in_terminal`]
/// — deliberately omits `no_window`.
#[allow(dead_code)] // every arm of open_in_terminal is platform-gated
fn spawn_visible(program: &str, args: &[&OsStr], cwd: Option<&Path>) -> Result<(), AppError> {
    log_spawn(program, args, cwd, "visible-terminal");
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.spawn()
        .map_err(|e| AppError::Io(format!("spawn {program}: {e}")))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/// Debug-log a spawn with URL credentials masked. Logs program, args,
/// cwd, and a `kind` tag only — never environment variables, tokens, or
/// secrets.
pub fn log_spawn(program: &str, args: &[&OsStr], cwd: Option<&Path>, kind: &str) {
    if !log::log_enabled!(log::Level::Debug) {
        return;
    }
    let redacted: Vec<String> = args
        .iter()
        .map(|a| redact_url_credentials(&a.to_string_lossy()))
        .collect();
    let cwd = cwd
        .map(|c| c.display().to_string())
        .unwrap_or_else(|| "<inherit>".to_string());
    log::debug!("spawn[{kind}]: program={program} args={redacted:?} cwd={cwd}");
}

/// Replace `scheme://user[:secret]@host…` with `scheme://***@host…`.
/// Non-URL args (and credential-free URLs) pass through unchanged. The
/// canonical redactor; `crate::sandbox` reuses it for git arg logging.
pub fn redact_url_credentials(arg: &str) -> String {
    let Some(scheme_end) = arg.find("://") else {
        return arg.to_string();
    };
    let after = scheme_end + 3;
    let Some(at_rel) = arg[after..].find('@') else {
        return arg.to_string();
    };
    let at = after + at_rel;
    format!("{}://***@{}", &arg[..scheme_end], &arg[at + 1..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_executable_finds_sh_on_unix() {
        if cfg!(unix) {
            assert!(resolve_executable("sh").is_some());
        }
    }

    #[test]
    fn command_available_false_for_missing() {
        assert!(!command_available("definitely-not-a-real-binary-zxcv"));
    }

    #[test]
    fn resolve_executable_absolute_path_probed_directly() {
        if cfg!(unix) {
            assert_eq!(
                resolve_executable("/bin/sh"),
                Some(PathBuf::from("/bin/sh"))
            );
        }
    }

    #[test]
    fn shell_run_flags_are_shell_aware() {
        assert_eq!(Shell::Cmd.run_flag(), "/C");
        assert_eq!(Shell::PowerShell.run_flag(), "-Command");
        assert_eq!(Shell::Posix(OsString::from("/bin/bash")).run_flag(), "-c");
    }

    #[test]
    fn resolve_package_manager_none_without_package_json() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_package_manager(dir.path()).is_none());
    }

    #[test]
    fn resolve_package_manager_prefers_pnpm_lock() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), "{}").unwrap();
        std::fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(resolve_package_manager(dir.path()).unwrap().name, "pnpm");
    }

    #[test]
    fn resolve_package_manager_defaults_to_npm() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), "{}").unwrap();
        assert_eq!(resolve_package_manager(dir.path()).unwrap().name, "npm");
    }

    #[test]
    fn redacts_embedded_token() {
        assert_eq!(
            redact_url_credentials("https://x-access-token:gho_secret@github.com/foo/bar.git"),
            "https://***@github.com/foo/bar.git"
        );
    }

    #[test]
    fn leaves_plain_args_untouched() {
        assert_eq!(redact_url_credentials("push"), "push");
        assert_eq!(
            redact_url_credentials("https://github.com/foo/bar.git"),
            "https://github.com/foo/bar.git"
        );
    }
}
