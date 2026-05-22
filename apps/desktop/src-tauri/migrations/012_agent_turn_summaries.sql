-- migrations/012_agent_turn_summaries.sql
-- Schema v12: compact per-assistant-turn summaries used by future runs.
-- Backs the ContextCompiler v1 architecture (docs/agent-context-architecture.md).
--
-- Each completed assistant turn produces one row here, written by the
-- post-run hook in the runner supervisor task. The summary is the
-- deterministic distillation of `timeline_json` + `agent_events` for the
-- just-finished run: which files the agent read, which it edited, which
-- commands it ran, what errors/decisions/next-steps it surfaced. The
-- ContextCompiler reads these rows into `operational_summaries` so the
-- next turn sees a compact working-state reconstruction instead of a
-- raw stream replay.
--
-- v1 builder is deterministic (no LLM call). An LLM-driven compressor
-- is deferred (see "Deferred" section in the architecture doc).
--
-- The `chat_id` denorm lets us list summaries for a chat without a join
-- through agent_runs -> threads; the index covers the ordering we need.

CREATE TABLE agent_turn_summaries (
  summary_id        TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES agent_runs(run_id),
  message_id        TEXT NOT NULL REFERENCES messages(message_id),
  chat_id           TEXT NOT NULL REFERENCES chats(chat_id),
  files_read_json   TEXT,                -- JSON array of paths; NULL = none
  files_edited_json TEXT,                -- JSON array of paths; NULL = none
  commands_run_json TEXT,                -- JSON array of command strings (truncated to 200 chars); NULL = none
  key_results_json  TEXT,                -- JSON array of "ToolName: result-summary" strings; NULL = none
  text_summary      TEXT NOT NULL,       -- prose summary rendered into the envelope
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_agent_turn_summaries_chat
  ON agent_turn_summaries(chat_id, created_at);

UPDATE schema_version SET version = 12;
