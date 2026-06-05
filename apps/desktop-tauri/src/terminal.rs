//! PTY-backed terminal for one workspace. Powers Phase 4d's Terminal
//! tab (xterm.js front-end). One PTY per workspace, persisted across
//! navigation; killed when the workspace is archived.
//!
//! Surface:
//! - `spawn(worktree, cols, rows, on_event)` → `TerminalHandle`. Forks
//!   the user's `$SHELL` (Unix) / `cmd.exe` (Windows) inside `worktree`,
//!   spawns a reader thread that streams `TerminalEvent::Output` via
//!   the `tauri::ipc::Channel`, emits `TerminalEvent::Exited` when EOF.
//! - `TerminalHandle::write` / `resize` — owned by `TerminalRegistry`,
//!   reachable via `Arc` from the command layer.
//! - `Drop` on `TerminalHandle` kills the child + drops the PTY.
//!
//! Vocabulary: the PTY's CWD is the worktree path; the shell's PS1 is
//! user-controlled and may display that path. Mozart's surrounding UI
//! never emits the path itself.

use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::ipc::Channel;

use crate::error::AppError;

/// Wire event payload pushed by the reader thread to the front-end.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    /// A chunk of UTF-8 stdout/stderr output.
    Output { data: String },
    /// The shell process exited (or the reader loop terminated).
    Exited { code: i32 },
}

/// Live PTY + child + master + writer for one workspace. Held inside
/// an `Arc` by `TerminalRegistry` so the command layer can write/resize
/// without holding the registry's lock.
pub struct TerminalHandle {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

impl TerminalHandle {
    pub fn write(&self, data: &[u8]) -> Result<(), AppError> {
        let mut w = self
            .writer
            .lock()
            .map_err(|_| AppError::Io("terminal writer poisoned".into()))?;
        w.write_all(data)
            .map_err(|e| AppError::Io(format!("terminal write: {e}")))?;
        w.flush()
            .map_err(|e| AppError::Io(format!("terminal flush: {e}")))?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), AppError> {
        let m = self
            .master
            .lock()
            .map_err(|_| AppError::Io("terminal master poisoned".into()))?;
        m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Io(format!("terminal resize: {e}")))
    }
}

impl Drop for TerminalHandle {
    fn drop(&mut self) {
        // Kill the child so the master EOFs and the reader thread exits.
        // wait() reaps the zombie; ignore errors — best-effort cleanup.
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Spawn a shell PTY rooted at `worktree`. The reader thread streams
/// output through `on_event` until EOF, then emits `Exited`.
pub fn spawn(
    worktree: &Path,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<TerminalHandle, AppError> {
    spawn_inner(worktree, cols, rows, None, on_event)
}

/// Spawn the user's shell with `-c "<command>"`, streaming the
/// command's output through `on_event`. When the command exits, the
/// reader emits `Exited`. Used by Phase 4e's Run tab.
pub fn spawn_command(
    worktree: &Path,
    cols: u16,
    rows: u16,
    command: String,
    on_event: Channel<TerminalEvent>,
) -> Result<TerminalHandle, AppError> {
    spawn_inner(worktree, cols, rows, Some(command), on_event)
}

fn spawn_inner(
    worktree: &Path,
    cols: u16,
    rows: u16,
    command: Option<String>,
    on_event: Channel<TerminalEvent>,
) -> Result<TerminalHandle, AppError> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Io(format!("openpty: {e}")))?;

    let (shell, run_flag) = default_shell();
    let mut cmd = CommandBuilder::new(shell);
    if let Some(c) = command.as_ref() {
        // Run once and exit; the reader's `Exited` pulse drives the Run
        // tab status badge. `cmd.exe` needs `/C`, not the POSIX `-c`.
        cmd.arg(run_flag);
        cmd.arg(c);
    }
    cmd.cwd(worktree);
    // Hint shells that we're running an interactive PTY.
    cmd.env("TERM", "xterm-256color");
    // A GUI-launched build inherits launchd/systemd's minimal PATH, so a
    // `-c` run/setup command ("npm run …") hits `command not found` —
    // unlike the interactive shell, it never sources `.zshrc`. Seed the
    // augmented PATH; an interactive shell layers its own profile on top.
    cmd.env("PATH", crate::shell_env::augmented_path());

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::AgentSpawn(format!("spawn shell: {e}")))?;
    // Drop slave so the master is the only handle keeping the PTY open;
    // otherwise reads block forever waiting for slave to close.
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| AppError::Io(format!("take_writer: {e}")))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| AppError::Io(format!("try_clone_reader: {e}")))?;

    let on_event_for_reader = on_event.clone();
    std::thread::Builder::new()
        .name("terminal-reader".into())
        .spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if on_event_for_reader
                            .send(TerminalEvent::Output { data })
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(e) => {
                        log::debug!("terminal reader error: {e}");
                        break;
                    }
                }
            }
            let _ = on_event_for_reader.send(TerminalEvent::Exited { code: 0 });
        })
        .map_err(|e| AppError::Io(format!("spawn terminal reader thread: {e}")))?;

    Ok(TerminalHandle {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
    })
}

/// The user's shell paired with the flag it uses to run a single command
/// string and exit. The flag must track the shell, not just the OS: a
/// Windows box with `$SHELL` pointing at Git Bash still wants `-c`.
fn default_shell() -> (String, &'static str) {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            let flag = run_flag_for(&shell);
            return (shell, flag);
        }
    }
    if cfg!(windows) {
        ("cmd.exe".to_string(), "/C")
    } else {
        ("/bin/bash".to_string(), "-c")
    }
}

/// Pick the run-once flag from the shell's file name.
fn run_flag_for(shell: &str) -> &'static str {
    let stem = std::path::Path::new(shell)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match stem.as_str() {
        "cmd" => "/C",
        "powershell" | "pwsh" => "-Command",
        _ => "-c",
    }
}

#[cfg(test)]
mod tests {
    use super::run_flag_for;

    #[test]
    fn run_flag_tracks_shell_family() {
        assert_eq!(run_flag_for("/bin/bash"), "-c");
        assert_eq!(run_flag_for("/usr/bin/zsh"), "-c");
        assert_eq!(run_flag_for("/usr/bin/fish"), "-c");
        assert_eq!(run_flag_for("cmd.exe"), "/C");
        assert_eq!(run_flag_for("pwsh"), "-Command");
        assert_eq!(run_flag_for("powershell.exe"), "-Command");
    }
}
