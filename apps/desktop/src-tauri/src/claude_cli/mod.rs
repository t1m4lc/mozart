//! `claude_cli` — subprocess + stream parser for the Anthropic Claude CLI.
//!
//! `StreamEvent` is the canonical, provider-agnostic shape that every future
//! `LlmProvider` adapter must produce. Anthropic-CLI specifics never leak
//! into this type — see plan §3 + D1.4-A/D1.4-B.

use serde::{Deserialize, Serialize};

pub mod parser;
pub mod install;
pub mod runner;

pub use runner::{spawn_run, RunHandle};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    StreamToken { text: String },
    /// Declared for `agent_events.event_type` round-trip + Angular binding stability;
    /// **not** emitted by `parse_line` in v0.0.1 (D1.4-A).
    ToolCall { name: String, args_json: String },
    CliOutput { line: String },
    /// Declared but **not** emitted by `parse_line` in v0.0.1 (D1.4-A).
    StatusUpdate { status: String },
    Error { message: String },
}

impl StreamEvent {
    /// Returns the canonical `agent_events.event_type` string for this variant.
    /// Must agree with `migrations/001_init.sql` (the cross-boundary grep in the
    /// validation gate enforces this).
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::StreamToken { .. } => "stream_token",
            Self::ToolCall { .. } => "tool_call",
            Self::CliOutput { .. } => "cli_output",
            Self::StatusUpdate { .. } => "status_update",
            Self::Error { .. } => "error",
        }
    }
}
