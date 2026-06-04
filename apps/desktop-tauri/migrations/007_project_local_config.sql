-- migrations/007_project_local_config.sql
-- Schema v7: per-project local config (user-machine only, never in repo).
-- Backs P0.3 bootstrap on Open project (see
-- docs/engineering/planning/dogfood-readiness.md § P0.3).
--
-- Holds the inferred run.json shape plus user preferences that must NOT
-- end up in the repo: mergeMode, etc. The repo-side equivalent lives in
-- .mozart/run.json on disk; this table is the local fallback and the
-- only place merge_mode is ever stored.
--
-- FK note: the spec writes `projects(id)`; the actual table is `repos(repo_id)`
-- (Project = repository in product vocabulary, but the DB still uses the
-- legacy `repos` name from v1). FK adjusted accordingly.

CREATE TABLE project_local_config (
  project_id   TEXT PRIMARY KEY,
  run_json     TEXT NOT NULL,                       -- mirrors .mozart/run.json shape
  merge_mode   TEXT NOT NULL DEFAULT 'pr',          -- 'pr' | 'local'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES repos(repo_id) ON DELETE CASCADE
);

UPDATE schema_version SET version = 7;
