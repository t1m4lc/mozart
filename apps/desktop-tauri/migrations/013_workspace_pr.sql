-- migrations/013_workspace_pr.sql
-- Schema v13: persist the pull-request opened from a workspace so the
-- create-PR dialog's success state ("Open in GitHub" + PR number) and
-- the workspace's PR status survive a dialog close / app restart, and
-- so a re-opened workspace can show `already-has-pr` instead of
-- re-attempting creation.
--
-- All three columns are nullable: a workspace has no PR until one is
-- opened. `pr_state` mirrors the GitHub PR state and is set to 'open'
-- on creation.

ALTER TABLE workspaces ADD COLUMN pr_url TEXT;
ALTER TABLE workspaces ADD COLUMN pr_number INTEGER;
ALTER TABLE workspaces ADD COLUMN pr_state TEXT;

UPDATE schema_version SET version = 13;
