//! Provider adapters for ContextCompiler v1 (T4 — D3 renderer/transport split).
//!
//! `EnvelopeRenderer` is the **pure** half — takes an `LLMEnvelope`,
//! returns a `RenderedEnvelope` (bytes + nonce + provider metadata).
//! Unit-testable without subprocess, which is the whole point of the
//! split: nonce framing + injection-defense behavior is verified by
//! pure-function tests.
//!
//! `ProviderTransport` is the **impure** half — owns subprocess +
//! stdin pipe + supervisor task. v1 transport (`ClaudeCliTransport`)
//! is wired into the existing runner.rs supervisor in T5; the trait
//! shape lives here so the future Anthropic Messages API adapter can
//! plug a different transport without touching the renderer.
//!
//! Module path: `claude_cli/providers/` for v1 ; renames to
//! `agent_providers/` when provider #2 lands (architecture doc →
//! "Deferred → Agent-provider module relocation").

pub mod claude_cli_renderer;
pub mod codex_renderer;

pub use claude_cli_renderer::{ClaudeCliRenderer, EnvelopeRenderer, RenderedEnvelope};
pub use codex_renderer::CodexRenderer;

/// Which agent backend a run targets. Selected per-run from the chat's
/// model (TS resolves model → provider and passes the id to
/// `start_agent_run`). The default + unknown-string fallback is
/// [`AgentProvider::ClaudeCli`] — the established, fully-sandboxed path —
/// so a malformed provider id never silently widens reach.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AgentProvider {
    #[default]
    ClaudeCli,
    Codex,
}

impl AgentProvider {
    /// Parse the wire id used by `RenderedEnvelope::provider` and the
    /// `start_agent_run` command. Anything other than `"codex"` resolves to
    /// [`AgentProvider::ClaudeCli`] (fail-closed to the sandboxed path).
    pub fn from_id(id: &str) -> Self {
        match id {
            "codex" => Self::Codex,
            _ => Self::ClaudeCli,
        }
    }
}
