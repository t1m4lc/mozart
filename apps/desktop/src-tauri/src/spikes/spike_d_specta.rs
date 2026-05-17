//! Spike D — tauri-specta bindings round-trip.
//!
//! Validates: plan-v0.1.0-beta.1.md L409 — "Rust enum + AppError → typed TS,
//! Angular `commands.x()` returns typed `Result<T, E>`".
//!
//! NOTE on scope: this spike does the generation in a TEST, not in build.rs.
//! Reason: build.rs runs in a separate compilation unit and can't easily
//! reference lib symbols. The official tauri-specta v2 pattern wires the
//! Builder in lib.rs `run()` with `#[cfg(debug_assertions)] builder.export(...)`.
//! Step 1.7 implements that for real production commands. This spike only
//! proves the typegen pipeline works end-to-end.
//!
//! Run with:
//!   cargo test --tests spike_d -- --ignored --nocapture

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SpikeResult {
    pub ok: bool,
    pub value: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub enum SpikeError {
    Invalid(String),
}

impl std::fmt::Display for SpikeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpikeError::Invalid(msg) => write!(f, "invalid input: {msg}"),
        }
    }
}

impl std::error::Error for SpikeError {}

#[tauri::command]
#[specta::specta]
pub fn spike_d_echo(n: i32) -> Result<SpikeResult, SpikeError> {
    if n < 0 {
        Err(SpikeError::Invalid(format!("n must be >= 0, got {n}")))
    } else {
        Ok(SpikeResult { ok: true, value: n })
    }
}

#[test]
#[ignore = "spike — writes a temp .ts file to assert tauri-specta works"]
fn spike_d_specta_generates_typed_bindings() -> anyhow::Result<()> {
    let tmp = tempfile::tempdir()?;
    let out = tmp.path().join("_bindings.ts");

    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![spike_d_echo])
        .typ::<SpikeResult>()
        .typ::<SpikeError>();

    builder.export(
        specta_typescript::Typescript::default(),
        &out,
    )?;

    let content = std::fs::read_to_string(&out)?;
    eprintln!("--- generated bindings ({}B) ---\n{content}", content.len());

    // Assert the type and command name made the round-trip.
    anyhow::ensure!(
        content.contains("SpikeResult"),
        "SpikeResult type missing from bindings"
    );
    anyhow::ensure!(
        content.contains("SpikeError"),
        "SpikeError enum missing from bindings"
    );
    anyhow::ensure!(
        content.contains("spikeDEcho") || content.contains("spike_d_echo"),
        "spike_d_echo command missing from bindings"
    );
    anyhow::ensure!(
        content.contains("Result<"),
        "Result<T, E> wrapper missing — typed error path not generated"
    );

    eprintln!("OK spike_d: tauri-specta bindings generated to {}", out.display());
    Ok(())
}
