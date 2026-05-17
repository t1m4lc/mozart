//! Spike E — `portable-pty` + `claude --version`.
//!
//! Validates: plan-v0.1.0-beta.1.md L410 — "Spawn claude auth in PTY, capture
//! OAuth URL output, open in browser, detect successful auth on completion".
//!
//! We do NOT actually run `claude auth login` (would prompt browser/OAuth).
//! Proving PTY can spawn `claude` and capture its output is enough for
//! v0.1.0-beta.1 viability — the OAuth flow detection lives in Step 1.4's
//! claude_cli.rs/auth.rs.
//!
//! Run with:
//!   cargo test --tests spike_e -- --ignored --nocapture

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;

fn claude_available() -> bool {
    std::process::Command::new("claude")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[test]
#[ignore = "spike — requires claude binary, run with --ignored"]
fn spike_e_pty_captures_claude_version() -> anyhow::Result<()> {
    if !claude_available() {
        eprintln!("SKIP spike_e: `claude` binary not on PATH or non-zero exit");
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.arg("--version");
    let mut child = pair.slave.spawn_command(cmd)?;
    // Drop slave so the child's PTY handle is the only writer; otherwise
    // master's read blocks forever waiting for the slave to close.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    let output = String::from_utf8_lossy(&buf);

    let status = child.wait()?;
    anyhow::ensure!(status.success(), "claude --version exited non-zero");
    anyhow::ensure!(
        output.to_lowercase().contains("claude"),
        "expected output to mention 'claude', got: {output:?}"
    );

    eprintln!("OK spike_e: PTY captured `claude --version` output: {}", output.trim());
    Ok(())
}
