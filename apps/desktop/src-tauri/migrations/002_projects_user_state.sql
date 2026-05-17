-- migrations/002_projects_user_state.sql
-- Schema v2: persist user-state on `repos` so hide / icon / reorder
-- survive an app restart. Pre-v0.1.0-beta.1 these lived only in the Angular
-- store. Feedback policy: DB-backed state over ephemeral.

ALTER TABLE repos ADD COLUMN icon TEXT;
ALTER TABLE repos ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0;

UPDATE schema_version SET version = 2;
