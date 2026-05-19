-- migrations/008_workspaces_last_merge_action.sql
-- Schema v8: per-workspace remembered merge action.
-- Backs P2.6 merge-now routing (see
-- docs/specs/plan-mozart-dogfood-readiness.md § P2.6, AD-02).
--
-- The primary "Create PR / Merge now" button derives its default label
-- from this column; the dropdown still shows both options. NULL means
-- "no prior choice on this workspace" — the routing falls back to
-- project_local_config.merge_mode, then to auto-detect from the git
-- remote. Values are 'pr' or 'local'.

ALTER TABLE workspaces ADD COLUMN last_merge_action TEXT;

UPDATE schema_version SET version = 8;
