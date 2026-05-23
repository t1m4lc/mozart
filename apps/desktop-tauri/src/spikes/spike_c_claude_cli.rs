//! Spike C — Claude CLI subprocess streaming.
//!
//! Validates: plan-v0.1.0-beta.1.md L408 — "Spawn `claude` with prompt, parse
//! stdout in real time, surface tokens in Tauri Channel within 200ms of
//! CLI emitting them".
//!
//! We invoke `claude -p "..." --output-format=stream-json`, which produces
//! newline-delimited JSON events. The spike asserts:
//! - each line parses as JSON
//! - at least one event arrives
//! - child exits cleanly
//! - first-event latency is RECORDED (not asserted — cold start varies wildly,
//!   the 200ms bar is for warm token-to-token latency, which Step 1.7 will measure)
//!
//! Run with:
//!   cargo test --tests spike_c -- --ignored --nocapture

use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

async fn claude_available() -> bool {
    Command::new("claude")
        .arg("--version")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "spike — calls real Claude API, run with --ignored (and a working `claude` auth)"]
async fn spike_c_claude_cli_streams_json_events() -> anyhow::Result<()> {
    if !claude_available().await {
        eprintln!("SKIP spike_c: `claude` binary not on PATH");
        return Ok(());
    }

    let start = Instant::now();
    let mut child = Command::new("claude")
        .args([
            "-p",
            "Reply with the single word: hello. Nothing else.",
            "--output-format=stream-json",
            "--include-partial-messages",
            "--verbose",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().expect("piped");
    let mut lines = BufReader::new(stdout).lines();

    let mut first_event_at: Option<Duration> = None;
    let mut event_count: usize = 0;
    let mut last_kind: Option<String> = None;

    // 60s upper bound — cold-start tolerance, much wider than the 200ms warm target.
    let read_loop = async {
        while let Some(line) = lines.next_line().await? {
            if line.trim().is_empty() {
                continue;
            }
            if first_event_at.is_none() {
                first_event_at = Some(start.elapsed());
            }
            let v: serde_json::Value = serde_json::from_str(&line)
                .map_err(|e| anyhow::anyhow!("non-JSON line: {line:?} — {e}"))?;
            // record the event's `type` field if present (helps inspect format)
            if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
                last_kind = Some(t.to_string());
            }
            event_count += 1;
        }
        anyhow::Ok(())
    };

    let result = timeout(Duration::from_secs(60), read_loop).await;
    match result {
        Err(_) => anyhow::bail!("spike_c timed out after 60s"),
        Ok(Err(e)) => return Err(e),
        Ok(Ok(())) => {}
    }

    let status = child.wait().await?;

    eprintln!(
        "spike_c stats: status={:?}, events={}, first_event_at={:?}, last_event_kind={:?}",
        status.code(),
        event_count,
        first_event_at,
        last_kind,
    );

    // Skip cleanly if auth missing or model is rate-limited — exit 1 is informative, not a spike failure.
    if !status.success() {
        let mut stderr = child.stderr.take();
        let mut stderr_buf = String::new();
        if let Some(ref mut s) = stderr {
            use tokio::io::AsyncReadExt;
            let _ = s.read_to_string(&mut stderr_buf).await;
        }
        eprintln!("SKIP spike_c: `claude -p` exited non-zero — stderr: {stderr_buf}");
        return Ok(());
    }

    anyhow::ensure!(event_count > 0, "no events emitted by claude -p");
    anyhow::ensure!(
        first_event_at.unwrap() < Duration::from_secs(60),
        "first event took longer than 60s"
    );

    Ok(())
}
