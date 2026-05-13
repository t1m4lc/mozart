-- migrations/001_init.sql
-- Schema v1 for Mozart v0.0.1.
-- Source of truth: docs/PLAN-v0.0.1.md § Data Model (D16, lines 174-278).
-- PRAGMAs are applied separately by db::apply_pragmas() at connection open.

CREATE TABLE schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version VALUES (1);

CREATE TABLE repos (
  repo_id      TEXT PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,    -- absolute, slash-normalized
  display_name TEXT NOT NULL,
  added_at     INTEGER NOT NULL
);

CREATE TABLE tasks (
  task_id      TEXT PRIMARY KEY,
  repo_id      TEXT NOT NULL REFERENCES repos(repo_id),
  title        TEXT NOT NULL,           -- human-friendly task title
  task_text    TEXT NOT NULL,           -- original user prompt
  status       TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at   INTEGER NOT NULL
);

CREATE TABLE workspaces (
  workspace_id    TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(task_id),
  name            TEXT NOT NULL,         -- user-facing workspace name (e.g. singer pool: 'eminem')
  worktree_path   TEXT NOT NULL UNIQUE,  -- absolute, slash-normalized
  branch_name     TEXT NOT NULL,         -- derived from `name`, prefixed agent/<slug>
  base_branch     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'initializing',
  -- initializing | ready | running | done | error | conflict | stopped | crashed
  pinned          BOOLEAN NOT NULL DEFAULT false,
  unread          BOOLEAN NOT NULL DEFAULT false,
  created_at      INTEGER NOT NULL,
  deletion_intent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE threads (
  thread_id    TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(workspace_id),  -- 1:1 in v0.0.1
  created_at   INTEGER NOT NULL
);

CREATE TABLE agent_runs (
  run_id         TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL REFERENCES threads(thread_id),
  prompt         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'initializing',
  -- initializing | running | done | error | stopped | crashed
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  exit_code      INTEGER,
  error_message  TEXT,
  checkpoint_sha TEXT  -- git sha of pre-run checkpoint commit
);

CREATE TABLE agent_events (
  event_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES agent_runs(run_id),
  event_type   TEXT NOT NULL,
  -- stream_token | tool_call | cli_output | status_update | error
  payload_json TEXT NOT NULL,           -- raw event payload
  ts           INTEGER NOT NULL
);

CREATE TABLE workspace_changes (
  change_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id),
  run_id         TEXT REFERENCES agent_runs(run_id),
  diff_text      TEXT NOT NULL,           -- unified diff vs base
  files_added    INTEGER NOT NULL DEFAULT 0,
  files_modified INTEGER NOT NULL DEFAULT 0,
  files_deleted  INTEGER NOT NULL DEFAULT 0,
  captured_at    INTEGER NOT NULL
);

CREATE TABLE events_outbox (
  outbox_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name   TEXT NOT NULL,
  props_json   TEXT NOT NULL,
  enqueued_at  INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX idx_workspaces_task     ON workspaces(task_id);
CREATE INDEX idx_threads_workspace   ON threads(workspace_id);
CREATE INDEX idx_runs_thread         ON agent_runs(thread_id);
CREATE INDEX idx_events_run          ON agent_events(run_id, ts);
CREATE INDEX idx_changes_workspace   ON workspace_changes(workspace_id, captured_at);
CREATE INDEX idx_outbox_enqueued     ON events_outbox(enqueued_at) WHERE attempts < 5;
