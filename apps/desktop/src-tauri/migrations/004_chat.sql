-- migrations/004_chat.sql
-- Schema v4: persistent chats / messages / active-chat-per-workspace.
-- Per docs/specs/plan.md §1192-1221 the workspace_id UNIQUE constraint
-- from v0.0.1 `threads` is intentionally dropped here — the tab bar
-- already supports up to 4 chats per workspace. `threads` remains for
-- the agent_runs.thread_id linkage; in v0.1.0 we'll either collapse
-- them or migrate runs onto chats directly. messages.run_id is the
-- forward FK for replay/orphan reconciliation.

CREATE TABLE chats (
  chat_id      TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  title        TEXT NOT NULL DEFAULT 'Untitled',
  llm_id       TEXT,
  closed_at    INTEGER,          -- NULL = open
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_chats_workspace_open ON chats(workspace_id) WHERE closed_at IS NULL;

CREATE TABLE messages (
  message_id    TEXT PRIMARY KEY,
  chat_id       TEXT NOT NULL REFERENCES chats(chat_id),
  run_id        TEXT REFERENCES agent_runs(run_id),
  role          TEXT NOT NULL,         -- 'user' | 'assistant' | 'system'
  content       TEXT NOT NULL,
  mode          TEXT,                  -- 'normal' | 'plan'
  status        TEXT NOT NULL,         -- 'pending'|'queued'|'streaming'|'done'|'error'|'stopped'
  timeline_json TEXT,                  -- assistant turns only; null otherwise
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);

CREATE TABLE workspace_active_chat (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(workspace_id),
  chat_id      TEXT NOT NULL REFERENCES chats(chat_id)
);

UPDATE schema_version SET version = 4;
