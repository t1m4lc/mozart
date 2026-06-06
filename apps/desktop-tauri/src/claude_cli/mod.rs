//! `claude_cli` — subprocess + stream parser for the Anthropic Claude CLI.
//!
//! `StreamEvent` is the canonical, provider-agnostic shape that every future
//! `LlmProvider` adapter must produce. Anthropic-CLI specifics never leak
//! into this type — see plan §3 + D1.4-A/D1.4-B.

use serde::{Deserialize, Serialize};

pub mod bin_path;
pub mod codex_parser;
pub mod codex_session;
pub mod context_compiler;
pub mod envelope;
pub mod install;
pub mod parser;
pub mod providers;
pub mod runner;
pub mod sandbox_policy;
pub mod session;
pub mod summary_builder;

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
    /// Token usage reported by the provider. Both CLIs emit usage we
    /// previously discarded: Claude on `message_start` (input + cache) and
    /// `message_delta` (cumulative output), Codex on `turn.completed`. Fields
    /// are independently optional because each emission carries only a subset.
    Usage {
        #[serde(skip_serializing_if = "Option::is_none", default)]
        input_tokens: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        output_tokens: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        cache_read_tokens: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        cache_creation_tokens: Option<i64>,
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
            Self::Usage { .. } => "usage",
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
    /// P2.7 — the workspace whose supervisor task reached this terminal
    /// status. The Changes-tab auto-route filters on this field so a
    /// background run for workspace A doesn't yank the user's view in
    /// workspace B.
    pub workspace_id: String,
}
