//! `CodexRenderer` — flat-text + nonce-framed rendering for the Codex CLI
//! provider.
//!
//! Codex's `codex exec` has no `--append-system-prompt`: the whole prompt
//! (system rules + context + user message) rides stdin as one blob. The
//! Claude CLI renderer already produces exactly that — a self-contained,
//! nonce-framed flat-text envelope — so this renderer reuses
//! [`render_with_nonce`] verbatim and only stamps a different `provider`
//! tag onto the [`RenderedEnvelope`] (persisted to `agent_run_envelopes`
//! for audit). The injection-defense nonce framing is identical.

use crate::claude_cli::envelope::{estimate_tokens, LLMEnvelope};
use crate::claude_cli::providers::claude_cli_renderer::{
    render_with_nonce, EnvelopeRenderer, NonceSource, RenderedEnvelope,
};

const PROVIDER_NAME: &str = "codex";

/// Flat-text renderer for the Codex CLI provider. Stateless except for the
/// nonce source — [`CodexRenderer::default`] picks fresh random nonces,
/// [`CodexRenderer::with_fixed_nonce`] returns a constant for snapshot tests.
pub struct CodexRenderer {
    nonce_source: NonceSource,
}

impl Default for CodexRenderer {
    fn default() -> Self {
        Self {
            nonce_source: NonceSource::Random,
        }
    }
}

impl CodexRenderer {
    #[cfg(test)]
    pub fn with_fixed_nonce(nonce: impl Into<String>) -> Self {
        Self {
            nonce_source: NonceSource::Fixed(nonce.into()),
        }
    }
}

impl EnvelopeRenderer for CodexRenderer {
    fn render(&self, envelope: &LLMEnvelope) -> RenderedEnvelope {
        let nonce = self.nonce_source.next();
        let bytes = render_with_nonce(envelope, &nonce);
        let char_count = bytes.len();
        RenderedEnvelope {
            bytes,
            nonce,
            provider: PROVIDER_NAME.into(),
            char_count,
            est_tokens: estimate_tokens(char_count),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_cli::envelope::{
        AttachedContextLayer, CurrentUserMessage, LLMEnvelope, OperationalSummariesLayer,
        ProjectMemoryLayer, RecentConversationLayer, SystemRulesLayer, WorkspaceStateLayer,
    };

    fn sample_envelope() -> LLMEnvelope {
        LLMEnvelope {
            system_rules: SystemRulesLayer {
                mode: "agent".into(),
                sandbox_level: "L3Workspace".into(),
                authority_clamp: "AUTHORITY CLAMP TEXT".into(),
            },
            project_memory: ProjectMemoryLayer { items: Vec::new() },
            workspace_state: WorkspaceStateLayer {
                workspace_path: "/wt-test".into(),
                branch_name: "agent/wip".into(),
                base_branch: "main".into(),
                sibling_paths: Vec::new(),
            },
            recent_conversation: RecentConversationLayer { turns: Vec::new() },
            operational_summaries: OperationalSummariesLayer {
                summaries: Vec::new(),
            },
            attached_context: AttachedContextLayer { items: Vec::new() },
            current_user_message: CurrentUserMessage {
                message_id: "msg-current".into(),
                content: "hello codex".into(),
                mode: Some("agent".into()),
                created_at: 1,
            },
        }
    }

    #[test]
    fn stamps_codex_provider_and_frames_every_layer() {
        let nonce = "deadbeefdeadbeefdeadbeefdeadbeef";
        let out = CodexRenderer::with_fixed_nonce(nonce).render(&sample_envelope());
        assert_eq!(out.provider, "codex");
        // Same nonce-framed layer structure as the Claude renderer.
        assert!(out.bytes.contains(&format!("<MOZART_LAYER_SYSTEM_RULES_{nonce}>")));
        assert!(out.bytes.contains(&format!("<MOZART_LAYER_CURRENT_USER_MESSAGE_{nonce}>")));
        assert_eq!(out.char_count, out.bytes.len());
    }

    #[test]
    fn user_content_appears_once() {
        let out = CodexRenderer::default().render(&sample_envelope());
        assert_eq!(out.bytes.matches("hello codex").count(), 1);
    }
}
