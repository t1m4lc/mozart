-- migrations/003_workspaces_ui_status.sql
-- Schema v3: persist the workspace kanban column. Distinct from
-- workspaces.status (runtime: initializing|ready|running|done|...).
-- The UI status is a user-chosen lane label: backlog|in_progress|
-- in_review|done|canceled.

ALTER TABLE workspaces ADD COLUMN ui_status TEXT NOT NULL DEFAULT 'backlog';

UPDATE schema_version SET version = 3;
