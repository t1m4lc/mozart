-- migrations/010_workspace_sandbox_level.sql
-- Schema v10: per-workspace agent sandbox isolation tier.
-- Backs P0.1 atom S0.1.B (see
-- docs/specs/plan-mozart-dogfood-readiness.md § P0.1 +
-- ~/.claude/plans/plan-the-fix-of-elegant-manatee.md).
--
-- Three values, persisted as the PascalCase strings the
-- `SandboxLevel` enum (de)serializes to: 'L1Mozart' (Mozart-wide),
-- 'L2Project' (default — sibling worktrees of the active project),
-- 'L3Workspace' (tightest — this worktree only).
--
-- Default 'L2Project' matches AD-01 / S0.1.B: the project is the
-- natural sharing unit so the agent can read sibling worktrees for
-- context. The argv builder in S0.1.C reads this column and emits
-- the corresponding `--add-dir` flags; the path guard in S0.1.D
-- enforces the same root set at the IPC boundary. The toggle UI is
-- deferred to TODO-008.

ALTER TABLE workspaces
  ADD COLUMN sandbox_level TEXT NOT NULL DEFAULT 'L2Project';

UPDATE schema_version SET version = 10;
