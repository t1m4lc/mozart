-- migrations/011_agent_run_envelopes.sql
-- Schema v11: per-run rendered envelope snapshot + prompt_source semantic shift.
-- Backs the ContextCompiler v1 architecture (docs/engineering/architecture/context-compiler.md,
-- CEO-reviewed 2026-05-22, ENG-reviewed 2026-05-22).
--
-- Two changes in one bundle:
--
-- 1. NEW TABLE `agent_run_envelopes` — stores the structured LLMEnvelope
--    (envelope_json) and the rendered bytes (rendered_text) we piped to the
--    provider for traceability and debugging. The `chat_id` column is
--    denormalized from `agent_runs -> threads -> chats` so the latest-50-per-chat
--    retention prune (D2) is a single indexed lookup instead of a join chain.
--    Retention prune fires inside the same post-run transaction that inserts
--    the new envelope; see db/agent_run_envelopes.rs.
--
-- 2. ALTER `agent_runs` adding `prompt_source` (D5). Old rows used the
--    frontend's collapsed `lastUserPrompt`; new rows (post-runner-rewire)
--    use `messages.content` resolved by `current_user_message_id`. The
--    column makes the semantic shift auditable. Existing rows backfill
--    via DEFAULT to 'frontend_collapsed'; the runner writes
--    'message_content' on every new run.

CREATE TABLE agent_run_envelopes (
  run_id        TEXT PRIMARY KEY REFERENCES agent_runs(run_id),
  chat_id       TEXT NOT NULL REFERENCES chats(chat_id),
  envelope_json TEXT NOT NULL,        -- structured LLMEnvelope, pre-rendering
  rendered_text TEXT NOT NULL,        -- the actual bytes piped to the provider
  provider      TEXT NOT NULL,        -- 'claude_cli' for v1
  nonce         TEXT NOT NULL,        -- per-run delimiter nonce (16-byte hex)
  char_count    INTEGER NOT NULL,
  est_tokens    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_agent_run_envelopes_chat_created
  ON agent_run_envelopes(chat_id, created_at);

ALTER TABLE agent_runs
  ADD COLUMN prompt_source TEXT NOT NULL DEFAULT 'frontend_collapsed';

UPDATE schema_version SET version = 11;
