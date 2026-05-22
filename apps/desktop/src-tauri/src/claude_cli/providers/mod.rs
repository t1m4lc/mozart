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

pub use claude_cli_renderer::{ClaudeCliRenderer, EnvelopeRenderer, RenderedEnvelope};
