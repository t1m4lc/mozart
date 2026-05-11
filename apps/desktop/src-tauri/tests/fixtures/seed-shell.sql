-- tests/fixtures/seed-shell.sql
-- Smoke fixture for the v0.0.1 shell (plan 08, atom S1.8a.5).
-- Inherited by plans 09–11. Apply AFTER migrations/001_init.sql against a
-- fresh database. Not idempotent: re-running will fail on PRIMARY KEY /
-- UNIQUE conflicts; tear down the file-backed DB between runs.
--
-- Shape: 1 project · 3 tasks (2 active + 1 archived) · 4 workspaces
-- (statuses: ready, running, error, done — the `done` workspace lives under
-- the archived task to satisfy the "archived" requirement; the workspaces
-- table itself has no `archived` status). All timestamps are
-- milliseconds-since-epoch to match the rest of the codebase.

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
