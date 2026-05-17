//! `claude_cli` — subprocess + stream parser for the Anthropic Claude CLI.
//!
//! `StreamEvent` is the canonical, provider-agnostic shape that every future
//! `LlmProvider` adapter must produce. Anthropic-CLI specifics never leak
//! into this type — see plan §3 + D1.4-A/D1.4-B.

use serde::{Deserialize, Serialize};

pub mod install;
pub mod parser;
pub mod runner;
pub mod session;

pub use runner::{spawn_run, RunHandle};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    StreamToken {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        args_json: String,
    },
    ToolResult {
        id: String,
        ok: bool,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        summary: Option<String>,
    },
    Thinking {
        id: String,
        text: String,
    },
    CliOutput {
        line: String,
    },
    StatusUpdate {
        status: String,
    },
    Error {
        message: String,
    },
}

impl StreamEvent {
    /// Returns the canonical `agent_events.event_type` string for this variant.
    /// Persisted into `agent_events.event_type` (TEXT column, no FK).
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::StreamToken { .. } => "stream_token",
            Self::ToolCall { .. } => "tool_call",
            Self::ToolResult { .. } => "tool_result",
            Self::Thinking { .. } => "thinking",
            Self::CliOutput { .. } => "cli_output",
            Self::StatusUpdate { .. } => "status_update",
            Self::Error { .. } => "error",
        }
    }
}

/// Fired once per `agent_runs` row when the supervisor task reaches a
/// terminal status (`done`, `error`, `stopped`, `crashed`). Front-end
/// consumers filter by `run_id` to learn when the channel stream is
/// safe to complete (Q2 — no polling).
///
/// This is the **only** tauri-specta event in v0.1.0-beta.1. The Rust crate
/// emits via `tauri_specta::Event::emit` on the `AppHandle`; the
/// Angular `_bindings.ts` surfaces it as `events.agentRunTerminated`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct AgentRunTerminated {
    pub run_id: String,
    pub status: String,
}
