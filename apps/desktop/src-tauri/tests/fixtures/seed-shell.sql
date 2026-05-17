-- tests/fixtures/seed-shell.sql
-- Smoke fixture for the v0.1.0-beta.1 shell (plan 08, atom S1.8a.5).
-- Inherited by plans 09–11. Apply AFTER migrations/001_init.sql.
--
-- **Idempotent (since S1.8b.4 dev-loop fix):** the DELETE block below wipes
-- the previously-seeded rows before re-inserting, so `pnpm seed` is safe to
-- re-run without `pnpm reset-db`. Note: DELETEs only target the rows owned
-- by this fixture (matched by their literal IDs) — real data created via
-- `add_repo` / `create_workspace` is untouched. The DELETE order respects
-- FK dependencies: agent_events → agent_runs → workspace_changes → threads
-- → workspaces → tasks → repos.
--
-- Shape: 1 project · 3 tasks (2 active + 1 archived) · 4 workspaces
-- (statuses: ready, running, error, done). Each workspace gets a paired
-- threads row (1:1 in v0.1.0-beta.1) so `start_agent_run` can resolve the thread.
--
-- ⚠ Caveat for end-to-end streaming smoke tests: the seeded `worktree_path`
-- values do NOT exist on disk; `start_agent_run` will fail when it tries to
-- `cd` into them. Use DevTools to bootstrap a real workspace instead:
--   await window.__mz.bindings.addRepo('/path/to/real/git/repo')
--   await window.__mz.bindings.createWorkspace(repoId, 'main', 'task text')
-- These rows are for sidebar/UI smoke only.
--
-- All timestamps are milliseconds-since-epoch to match the rest of the codebase.

-- ---------------------------------------------------------------------------
-- idempotency: wipe any previously-seeded rows owned by this fixture
-- ---------------------------------------------------------------------------
DELETE FROM agent_events WHERE run_id IN (
  SELECT run_id FROM agent_runs WHERE thread_id IN (
    SELECT thread_id FROM threads WHERE workspace_id IN (
      'ws-ready-1', 'ws-running-1', 'ws-error-1', 'ws-archived-1'
    )
  )
);
DELETE FROM workspace_changes WHERE workspace_id IN (
  'ws-ready-1', 'ws-running-1', 'ws-error-1', 'ws-archived-1'
);
DELETE FROM agent_runs WHERE thread_id IN (
  SELECT thread_id FROM threads WHERE workspace_id IN (
    'ws-ready-1', 'ws-running-1', 'ws-error-1', 'ws-archived-1'
  )
);
DELETE FROM threads WHERE workspace_id IN (
  'ws-ready-1', 'ws-running-1', 'ws-error-1', 'ws-archived-1'
);
DELETE FROM workspaces WHERE workspace_id IN (
  'ws-ready-1', 'ws-running-1', 'ws-error-1', 'ws-archived-1'
);
DELETE FROM tasks WHERE task_id IN (
  'task-active-1', 'task-active-2', 'task-archived-1'
);
DELETE FROM repos WHERE repo_id = 'repo-mozart';

-- ---------------------------------------------------------------------------
-- repos
-- ---------------------------------------------------------------------------
INSERT INTO repos (repo_id, path, display_name, added_at)
VALUES ('repo-mozart', '/Users/dev/work/mozart', 'mozart', 1715000000000);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
INSERT INTO tasks (task_id, repo_id, title, task_text, status, created_at)
VALUES ('task-active-1', 'repo-mozart', 'Refactor sidebar resize',
        'Make the left sidebar resizable with a draggable handle.',
        'active', 1715000100000);

INSERT INTO tasks (task_id, repo_id, title, task_text, status, created_at)
VALUES ('task-active-2', 'repo-mozart', 'Add task creation dialog',
        'New dialog to create a task from the workspace shell.',
        'active', 1715000200000);

INSERT INTO tasks (task_id, repo_id, title, task_text, status, created_at)
VALUES ('task-archived-1', 'repo-mozart', 'Old Spike: theme migration',
        'Archived exploration of moving tokens into a CSS layer.',
        'archived', 1714000000000);

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
INSERT INTO workspaces (workspace_id, task_id, worktree_path, branch_name,
                        base_branch, status, created_at, deletion_intent)
VALUES ('ws-ready-1', 'task-active-1',
        '/Users/dev/work/mozart/.worktrees/ws-ready-1',
        'agent/wip-ready1', 'main', 'ready', 1715000110000, 0);

INSERT INTO workspaces (workspace_id, task_id, worktree_path, branch_name,
                        base_branch, status, created_at, deletion_intent)
VALUES ('ws-running-1', 'task-active-1',
        '/Users/dev/work/mozart/.worktrees/ws-running-1',
        'agent/wip-run1', 'main', 'running', 1715000120000, 0);

INSERT INTO workspaces (workspace_id, task_id, worktree_path, branch_name,
                        base_branch, status, created_at, deletion_intent)
VALUES ('ws-error-1', 'task-active-2',
        '/Users/dev/work/mozart/.worktrees/ws-error-1',
        'agent/wip-err1', 'main', 'error', 1715000210000, 0);

INSERT INTO workspaces (workspace_id, task_id, worktree_path, branch_name,
                        base_branch, status, created_at, deletion_intent)
VALUES ('ws-archived-1', 'task-archived-1',
        '/Users/dev/work/mozart/.worktrees/ws-archived-1',
        'agent/wip-arch1', 'main', 'done', 1714000100000, 0);

-- ---------------------------------------------------------------------------
-- threads (1:1 with workspaces in v0.1.0-beta.1, required by start_agent_run)
-- ---------------------------------------------------------------------------
INSERT INTO threads (thread_id, workspace_id, created_at)
VALUES ('thread-ready-1',    'ws-ready-1',    1715000111000);
INSERT INTO threads (thread_id, workspace_id, created_at)
VALUES ('thread-running-1',  'ws-running-1',  1715000121000);
INSERT INTO threads (thread_id, workspace_id, created_at)
VALUES ('thread-error-1',    'ws-error-1',    1715000211000);
INSERT INTO threads (thread_id, workspace_id, created_at)
VALUES ('thread-archived-1', 'ws-archived-1', 1714000101000);
