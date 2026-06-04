-- migrations/009_workspace_file_views.sql
-- Schema v9: per-workspace, per-file "Viewed" review state.
-- Backs P2.2 Viewed state + diff toolbar (see
-- docs/engineering/planning/dogfood-readiness.md § P2.2,
-- AD-03 / [[mozart-viewed-principle]]).
--
-- Stores one row per file the reviewer has explicitly marked viewed in
-- a given workspace. `viewed_at_hash` is the truncated sha256 of the
-- file's content at the moment of the mark; comparing it against the
-- current on-disk hash lets the UI compute the
-- `changed since viewed` state without keeping a copy of the body.
--
-- A row's absence means "not viewed". A row whose hash matches current
-- content means "viewed". A row whose hash differs means
-- "changed since viewed".
--
-- The (workspace_id, path) pair is the natural primary key — there is
-- never more than one Viewed record per file per workspace.

CREATE TABLE workspace_file_views (
  workspace_id    TEXT NOT NULL,
  path            TEXT NOT NULL,
  viewed_at       INTEGER NOT NULL,
  viewed_at_hash  TEXT NOT NULL,
  PRIMARY KEY (workspace_id, path),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
);

CREATE INDEX idx_workspace_file_views_ws
  ON workspace_file_views(workspace_id);

UPDATE schema_version SET version = 9;
