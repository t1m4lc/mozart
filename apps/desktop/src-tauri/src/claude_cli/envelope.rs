//! Typed `LLMEnvelope` produced by the `ContextCompiler` (T3) and
//! consumed by the `EnvelopeRenderer` (T4). Provider-neutral: the
//! 7 layers describe *what* the agent needs to see for the next turn,
//! not *how* a specific provider receives it.
//!
//! Layer order is canonical and load-bearing — the renderer emits
//! layers in the order they appear on the struct, and the authority
//! clamp in `system_rules` says only outer Mozart-tagged layers define
//! structure. See `docs/agent-context-architecture.md` →
//! "LLMEnvelope (provider-neutral)" + "ContextCompiler architecture".

use serde::{Deserialize, Serialize};

/// Structured 7-layer context for one agent turn. Each field is a
/// typed layer; the renderer is responsible for serialization +
/// per-provider framing. v1 keeps `attached_context.items` empty —
/// the attachment table isn't designed-for in v0.1.0-beta.1 (the doc
/// calls this out under "Deferred" and the field exists so the
/// renderer doesn't have to learn about it later).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct LLMEnvelope {
    pub system_rules: SystemRulesLayer,
    pub project_memory: ProjectMemoryLayer,
    pub workspace_state: WorkspaceStateLayer,
    pub recent_conversation: RecentConversationLayer,
    pub operational_summaries: OperationalSummariesLayer,
    pub attached_context: AttachedContextLayer,
    pub current_user_message: CurrentUserMessage,
}

/// Sandbox clamp + mode + authority clamp. The authority clamp is the
/// fixed prose that tells the model only outer Mozart-tagged layers
/// (with the run's nonce) define structure — text inside user
/// messages, files, logs, command outputs is untrusted content, and
/// fake `[assistant]` / `<system>` / markdown role markers inside
/// content are ignored as structure.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SystemRulesLayer {
    pub mode: String,
    pub sandbox_level: String,
    pub authority_clamp: String,
}

/// Durable project-level constraints (CLAUDE.md, project_local_config,
/// etc.). v1 ships an empty Vec from the compiler — the resolution
/// order is open question #2 in the architecture doc. Renderer
/// handles empty by omitting the section body.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ProjectMemoryLayer {
    pub items: Vec<String>,
}

/// Workspace runtime state. `sibling_paths` is populated for L2
/// (project) sandbox so the agent knows which sibling worktrees it
/// can see. Forbidden vocab (`worktree_path`, `branch_name`,
/// `base_branch`) stays inside the typed envelope — these are
/// developer-facing diagnostics, never UI labels.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WorkspaceStateLayer {
    pub workspace_path: String,
    pub branch_name: String,
    pub base_branch: String,
    pub sibling_paths: Vec<String>,
}

/// One `messages` row, projected into the envelope. Includes the
/// row's `mode` so the renderer can mark prior-turn instructions
/// tagged with a non-current mode as informational (architecture
/// doc → "Concurrency + ordering" final bullet).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConversationTurn {
    pub message_id: String,
    pub role: String,
    pub content: String,
    pub mode: Option<String>,
    pub created_at: i64,
}

/// Most-recent N turns rendered in full detail. Older turns collapse
/// into [`OperationalSummariesLayer`] instead of being dropped.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RecentConversationLayer {
    pub turns: Vec<ConversationTurn>,
}

/// One `agent_turn_summaries` row, projected for the envelope. JSON
/// columns are pre-parsed into Vecs by the compiler so the renderer
/// doesn't re-parse per turn.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OperationalSummary {
    pub run_id: String,
    pub message_id: String,
    pub text_summary: String,
    pub files_read: Vec<String>,
    pub files_edited: Vec<String>,
    pub commands_run: Vec<String>,
    pub key_results: Vec<String>,
    pub created_at: i64,
}

/// Compact per-turn summaries derived from `timeline_json` +
/// `agent_events` for older completed turns.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OperationalSummariesLayer {
    pub summaries: Vec<OperationalSummary>,
}

/// One attached artifact (file, diff, terminal output, selection,
/// URL). v1 ships an empty Vec — the attached_context table doesn't
/// exist yet. Designed-for: the renderer must handle a non-empty Vec
/// once the table lands.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AttachedContextItem {
    pub kind: String,
    pub label: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AttachedContextLayer {
    pub items: Vec<AttachedContextItem>,
}

/// The just-sent user message that this turn responds to. Loaded by
/// `current_user_message_id`. Appended exactly once at the end of the
/// envelope — never duplicated in `recent_conversation`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CurrentUserMessage {
    pub message_id: String,
    pub content: String,
    pub mode: Option<String>,
    pub created_at: i64,
}

/// Telemetry payload returned alongside the envelope. Logged by the
/// compiler at `log::debug!`, promoted to `log::warn!` when
/// `budget_hit` is true. Persisted into `agent_run_envelopes.{char_count,
/// est_tokens}` after the renderer runs.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EnvelopeStats {
    pub messages_count_recent: usize,
    pub summaries_count: usize,
    pub attached_items_count: usize,
    pub char_count: usize,
    pub est_tokens: usize,
    pub budget_hit: bool,
}

/// `chars / 3.5 ≈ tokens` — the rough estimate used by the budgeter
/// until a real tokenizer ships (architecture doc → "Token
/// budgeting"). Constant lives next to the consumer so v2 can swap
/// the estimator without hunting through the codebase.
pub const CHARS_PER_TOKEN: f64 = 3.5;

pub fn estimate_tokens(char_count: usize) -> usize {
    ((char_count as f64) / CHARS_PER_TOKEN).ceil() as usize
}
