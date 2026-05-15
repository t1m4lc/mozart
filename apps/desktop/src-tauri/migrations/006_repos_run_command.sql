-- migrations/006_repos_run_command.sql
-- Schema v6: per-project run command, surfaced by Phase 4e's Run tab.
-- Nullable — projects without a run command show a setup form in the
-- Run tab rather than running immediately.

ALTER TABLE repos ADD COLUMN run_command TEXT;

UPDATE schema_version SET version = 6;
