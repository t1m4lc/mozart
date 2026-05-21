//! CRUD for the `workspaces` table — the busiest model in v0.1.0-beta.1.

use rusqlite::{params, Connection};

use crate::db::models::Workspace;
use crate::error::AppError;

pub fn create(conn: &Connection, ws: &Workspace) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspaces(workspace_id, task_id, name, worktree_path, branch_name, base_branch, status, pinned, unread, created_at, deletion_intent, ui_status, last_merge_action, sandbox_level)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![ws.workspace_id, ws.task_id, ws.name, ws.worktree_path, ws.branch_name, ws.base_branch, ws.status, ws.pinned, ws.unread, ws.created_at, ws.deletion_intent, ws.ui_status, ws.last_merge_action, ws.sandbox_level],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, workspace_id: &str) -> Result<Workspace, AppError> {
    conn.query_row(
        "SELECT workspace_id, task_id, name, worktree_path, branch_name, base_branch, status, pinned, unread, created_at, deletion_intent, ui_status, last_merge_action, sandbox_level
         FROM workspaces WHERE workspace_id = ?1",
        [workspace_id],
        row_to_workspace,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("workspace id={workspace_id}"))
        }
        other => other.into(),
    })
}

pub fn list_by_task(conn: &Connection, task_id: &str) -> Result<Vec<Workspace>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT workspace_id, task_id, name, worktree_path, branch_name, base_branch, status, pinned, unread, created_at, deletion_intent, ui_status, last_merge_action, sandbox_level
         FROM workspaces WHERE task_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([task_id], row_to_workspace)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

pub fn list_all(conn: &Connection) -> Result<Vec<Workspace>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT workspace_id, task_id, name, worktree_path, branch_name, base_branch, status, pinned, unread, created_at, deletion_intent, ui_status, last_merge_action, sandbox_level
         FROM workspaces ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_workspace)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// P0.1 S0.1.C — enumerate the active siblings of a project for the
/// L2 sandbox flag set. Returns up to `limit` workspaces under the
/// project (= repo) ordered by last-agent-run time (with workspace
/// `created_at` as the fallback for workspaces that have never run).
/// Excludes rows with `deletion_intent > 0`.
///
/// Used by [`crate::claude_cli::runner::spawn_run`] to compute the
/// `--add-dir` set for an L2 run; the limit defends against the CG-1
/// argv-length blow-up flagged in the plan (~128 KB argv ceiling on
/// most Unixes). The active workspace is NOT force-included here —
/// callers that need that guarantee should re-insert it after the
/// query (the runner does this).
///
/// `project_id` matches `tasks.repo_id` (Mozart vocabulary maps
/// project → repo at the storage layer).
pub fn list_active_siblings_for_project(
    conn: &Connection,
    project_id: &str,
    limit: usize,
) -> Result<Vec<Workspace>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT w.workspace_id, w.task_id, w.name, w.worktree_path, w.branch_name, w.base_branch,
                w.status, w.pinned, w.unread, w.created_at, w.deletion_intent, w.ui_status,
                w.last_merge_action, w.sandbox_level
         FROM workspaces w
         INNER JOIN tasks t ON w.task_id = t.task_id
         LEFT JOIN threads th ON th.workspace_id = w.workspace_id
         LEFT JOIN agent_runs r ON r.thread_id = th.thread_id
         WHERE t.repo_id = ?1
           AND w.deletion_intent = 0
         GROUP BY w.workspace_id
         ORDER BY COALESCE(MAX(r.started_at), w.created_at) DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![project_id, limit as i64], row_to_workspace)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn update_status(conn: &Connection, workspace_id: &str, status: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET status = ?1 WHERE workspace_id = ?2",
        params![status, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn update_branch_name(conn: &Connection, workspace_id: &str, branch_name: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET branch_name = ?1 WHERE workspace_id = ?2",
        params![branch_name, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn update_worktree_path(conn: &Connection, workspace_id: &str, path: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET worktree_path = ?1 WHERE workspace_id = ?2",
        params![path, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn set_deletion_intent(conn: &Connection, workspace_id: &str, intent: bool) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET deletion_intent = ?1 WHERE workspace_id = ?2",
        params![intent as i64, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn set_pinned(conn: &Connection, workspace_id: &str, pinned: bool) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET pinned = ?1 WHERE workspace_id = ?2",
        params![pinned, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn set_unread(conn: &Connection, workspace_id: &str, unread: bool) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET unread = ?1 WHERE workspace_id = ?2",
        params![unread, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

fn row_to_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        workspace_id: row.get(0)?,
        task_id: row.get(1)?,
        name: row.get(2)?,
        worktree_path: row.get(3)?,
        branch_name: row.get(4)?,
        base_branch: row.get(5)?,
        status: row.get(6)?,
        pinned: row.get(7)?,
        unread: row.get(8)?,
        created_at: row.get(9)?,
        deletion_intent: row.get(10)?,
        ui_status: row.get(11)?,
        last_merge_action: row.get(12)?,
        sandbox_level: row.get(13)?,
    })
}

pub fn set_name(conn: &Connection, workspace_id: &str, name: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET name = ?1 WHERE workspace_id = ?2",
        params![name, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

pub fn set_ui_status(
    conn: &Connection,
    workspace_id: &str,
    ui_status: &str,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET ui_status = ?1 WHERE workspace_id = ?2",
        params![ui_status, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

// Plan P2.6 AD-02 — remembered merge action for the primary-button
// label. `'pr'` or `'local'` after the user picks; the dropdown still
// shows both options regardless. Stored per workspace so each one
// remembers what was last clicked.
pub fn set_last_merge_action(
    conn: &Connection,
    workspace_id: &str,
    action: &str,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET last_merge_action = ?1 WHERE workspace_id = ?2",
        params![action, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

// Plan P0.1 S0.1.E — debug-only sandbox-level setter. The caller
// validates `level` against `SandboxLevel::from_str` before reaching
// this mutator; the DB itself is not the right place to enforce the
// enum because the column type is TEXT (sqlite's type discipline is
// nominal at most). The level string is whatever PascalCase variant
// `SandboxLevel` produces — see the migration default for the
// canonical literal.
pub fn set_sandbox_level(
    conn: &Connection,
    workspace_id: &str,
    level: &str,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE workspaces SET sandbox_level = ?1 WHERE workspace_id = ?2",
        params![level, workspace_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("workspace id={workspace_id}")));
    }
    Ok(())
}

// Plan P0.2 — the freeze guard reads `ui_status` (the kanban-level
// state, not the runtime `status` column) and treats `done` and
// `canceled` as the two closed states. Done↔canceled transitions stay
// frozen on both sides; only a move INTO an active state lifts the
// freeze. Unknown workspace ids surface as `NotFound` so callers don't
// silently pass the guard for a stale id.
pub fn is_frozen(conn: &Connection, workspace_id: &str) -> Result<bool, AppError> {
    conn.query_row(
        "SELECT ui_status FROM workspaces WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get::<_, String>(0),
    )
    .map(|s| s == "done" || s == "canceled")
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("workspace id={workspace_id}"))
        }
        other => other.into(),
    })
}

// Returns `Err(AppError::Frozen)` when the workspace is in the `done`
// UI state. Used as the single guard at the head of every mutating
// Tauri command listed in the P0.2 audit (start_agent_run,
// install_workspace_packages, start_workspace_run, write_terminal,
// discard_workspace_changes). Closure-flow commands (commit, push,
// create_pr, set_workspace_ui_status) intentionally bypass this.
pub fn assert_workspace_active(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
    if is_frozen(conn, workspace_id)? {
        return Err(AppError::Frozen(workspace_id.to_string()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks};
    use crate::db::models::{Repo, Task};

    fn seed_task(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms(), icon: None, hidden: false, sort_index: 0, run_command: None };
        repos::create(conn, &r).unwrap();
        let t = Task { task_id: new_id(), repo_id: r.repo_id, title: "t".into(), task_text: "t".into(), status: "active".into(), created_at: now_ms() };
        tasks::create(conn, &t).unwrap();
        t.task_id
    }

    fn make_ws(task_id: &str, suffix: &str) -> Workspace {
        Workspace {
            workspace_id: new_id(),
            task_id: task_id.to_string(),
            name: format!("ws-{suffix}"),
            worktree_path: format!("/wt-{suffix}-{}", new_id()),
            branch_name: format!("agent/wip-{suffix}"),
            base_branch: "main".into(),
            status: "initializing".into(),
            pinned: false,
            unread: false,
            created_at: now_ms(),
            deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
        }
    }

    #[test]
    fn set_name_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "sn");
        create(&conn, &ws).unwrap();
        set_name(&conn, &ws.workspace_id, "pavarotti").unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().name, "pavarotti");
    }

    #[test]
    fn set_name_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = set_name(&conn, "no-such-ws", "x").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn ui_status_defaults_to_backlog_and_round_trips() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "us");
        create(&conn, &ws).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().ui_status, "backlog");
        set_ui_status(&conn, &ws.workspace_id, "in_progress").unwrap();
        assert_eq!(
            get(&conn, &ws.workspace_id).unwrap().ui_status,
            "in_progress"
        );
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "rt");
        create(&conn, &ws).unwrap();
        let got = get(&conn, &ws.workspace_id).unwrap();
        assert_eq!(got.branch_name, ws.branch_name);
        assert_eq!(got.status, "initializing");
    }

    #[test]
    fn list_by_task_filters_correctly() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let t1 = seed_task(&conn);
        let t2 = seed_task(&conn);
        create(&conn, &make_ws(&t1, "a")).unwrap();
        create(&conn, &make_ws(&t1, "b")).unwrap();
        create(&conn, &make_ws(&t2, "c")).unwrap();
        assert_eq!(list_by_task(&conn, &t1).unwrap().len(), 2);
        assert_eq!(list_by_task(&conn, &t2).unwrap().len(), 1);
        assert_eq!(list_all(&conn).unwrap().len(), 3);
    }

    #[test]
    fn status_lifecycle() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "lc");
        create(&conn, &ws).unwrap();
        for s in ["ready", "running", "done"] {
            update_status(&conn, &ws.workspace_id, s).unwrap();
            assert_eq!(get(&conn, &ws.workspace_id).unwrap().status, s);
        }
    }

    #[test]
    fn rename_branch() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "br");
        create(&conn, &ws).unwrap();
        update_branch_name(&conn, &ws.workspace_id, "feature/real-name").unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().branch_name, "feature/real-name");
    }

    #[test]
    fn deletion_intent_toggle() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "del");
        create(&conn, &ws).unwrap();
        set_deletion_intent(&conn, &ws.workspace_id, true).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().deletion_intent, 1);
        set_deletion_intent(&conn, &ws.workspace_id, false).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().deletion_intent, 0);
    }

    #[test]
    fn update_worktree_path_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "wp");
        create(&conn, &ws).unwrap();
        update_worktree_path(&conn, &ws.workspace_id, "/tmp/foo").unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().worktree_path, "/tmp/foo");
    }

    #[test]
    fn update_worktree_path_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = update_worktree_path(&conn, "no-such-id", "/x").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn update_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = update_status(&conn, "no-such-ws", "done").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn pinned_toggle_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "pin");
        create(&conn, &ws).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().pinned, false);
        set_pinned(&conn, &ws.workspace_id, true).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().pinned, true);
        set_pinned(&conn, &ws.workspace_id, false).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().pinned, false);
    }

    #[test]
    fn unread_toggle_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "unr");
        create(&conn, &ws).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().unread, false);
        set_unread(&conn, &ws.workspace_id, true).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().unread, true);
        set_unread(&conn, &ws.workspace_id, false).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().unread, false);
    }

    #[test]
    fn set_pinned_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = set_pinned(&conn, "no-such-ws", true).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn set_unread_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = set_unread(&conn, "no-such-ws", true).unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn last_merge_action_defaults_null_and_round_trips() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "lma");
        create(&conn, &ws).unwrap();
        assert!(get(&conn, &ws.workspace_id).unwrap().last_merge_action.is_none());
        set_last_merge_action(&conn, &ws.workspace_id, "local").unwrap();
        assert_eq!(
            get(&conn, &ws.workspace_id).unwrap().last_merge_action.as_deref(),
            Some("local")
        );
        set_last_merge_action(&conn, &ws.workspace_id, "pr").unwrap();
        assert_eq!(
            get(&conn, &ws.workspace_id).unwrap().last_merge_action.as_deref(),
            Some("pr")
        );
    }

    #[test]
    fn set_last_merge_action_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = set_last_merge_action(&conn, "no-such-ws", "pr").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn sandbox_level_round_trips() {
        // Atom S0.1.B regression: the new column reads back exactly
        // what was inserted, including all three valid PascalCase
        // values that `SandboxLevel::from_str` accepts.
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        for level in ["L1Mozart", "L2Project", "L3Workspace"] {
            let mut ws = make_ws(&task_id, level);
            ws.sandbox_level = level.into();
            create(&conn, &ws).unwrap();
            assert_eq!(get(&conn, &ws.workspace_id).unwrap().sandbox_level, level);
        }
    }

    #[test]
    fn sandbox_level_default_backfills_via_patch() {
        // Pre-existing dev DB rows must self-heal to 'L2Project' via
        // `patch_workspaces_columns`. Simulate by inserting through a
        // raw SQL path that omits the new column entirely.
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let id = new_id();
        conn.execute(
            "INSERT INTO workspaces(workspace_id, task_id, name, worktree_path, branch_name, base_branch, status, pinned, unread, created_at, deletion_intent, ui_status, last_merge_action)
             VALUES (?1, ?2, 'legacy', '/wt-legacy', 'agent/wip-legacy', 'main', 'initializing', 0, 0, ?3, 0, 'backlog', NULL)",
            params![id, task_id, now_ms()],
        ).unwrap();
        assert_eq!(get(&conn, &id).unwrap().sandbox_level, "L2Project");
    }

    #[test]
    fn set_sandbox_level_round_trips_three_values() {
        // Atom S0.1.E — the debug-only command writes through this
        // mutator. Confirm round-trip for all three valid PascalCase
        // values; the caller is responsible for parse-rejecting
        // unknown strings.
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let ws = make_ws(&task_id, "lvl");
        create(&conn, &ws).unwrap();
        for level in ["L1Mozart", "L3Workspace", "L2Project"] {
            set_sandbox_level(&conn, &ws.workspace_id, level).unwrap();
            assert_eq!(get(&conn, &ws.workspace_id).unwrap().sandbox_level, level);
        }
    }

    #[test]
    fn set_sandbox_level_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = set_sandbox_level(&conn, "no-such-ws", "L3Workspace").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    // -----------------------------------------------------------------
    // P0.1 S0.1.C — list_active_siblings_for_project
    // -----------------------------------------------------------------

    /// Seed a fresh project (repo) + return its `repo_id`. Distinct from
    /// `seed_task` which produces a task under a fresh repo each call.
    fn seed_project(conn: &Connection) -> String {
        let r = Repo {
            repo_id: new_id(),
            path: format!("/r-{}", new_id()),
            display_name: "r".into(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
            run_command: None,
        };
        repos::create(conn, &r).unwrap();
        r.repo_id
    }

    fn seed_task_under(conn: &Connection, repo_id: &str) -> String {
        let t = crate::db::models::Task {
            task_id: new_id(),
            repo_id: repo_id.to_string(),
            title: "t".into(),
            task_text: "t".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        crate::db::tasks::create(conn, &t).unwrap();
        t.task_id
    }

    #[test]
    fn list_active_siblings_returns_only_this_project() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let p1 = seed_project(&conn);
        let p2 = seed_project(&conn);
        let t1 = seed_task_under(&conn, &p1);
        let t2 = seed_task_under(&conn, &p2);
        create(&conn, &make_ws(&t1, "p1-a")).unwrap();
        create(&conn, &make_ws(&t1, "p1-b")).unwrap();
        create(&conn, &make_ws(&t2, "p2-c")).unwrap();

        let got = list_active_siblings_for_project(&conn, &p1, 20).unwrap();
        assert_eq!(got.len(), 2, "must filter to p1's workspaces only");
        for w in &got {
            assert_eq!(w.task_id, t1, "every result must belong to p1's task");
        }
    }

    #[test]
    fn list_active_siblings_excludes_deletion_intent() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let p = seed_project(&conn);
        let t = seed_task_under(&conn, &p);
        let alive = make_ws(&t, "alive");
        let mut doomed = make_ws(&t, "doomed");
        doomed.deletion_intent = 1;
        create(&conn, &alive).unwrap();
        create(&conn, &doomed).unwrap();

        let got = list_active_siblings_for_project(&conn, &p, 20).unwrap();
        assert_eq!(got.len(), 1, "deletion_intent>0 must be excluded");
        assert_eq!(got[0].workspace_id, alive.workspace_id);
    }

    #[test]
    fn list_active_siblings_respects_limit_for_cg1_argv_cap() {
        // CG-1 regression: the L2 cap defends against unbounded argv
        // growth. Feed 25 siblings; the function must return exactly
        // the cap (20).
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let p = seed_project(&conn);
        let t = seed_task_under(&conn, &p);
        for i in 0..25 {
            create(&conn, &make_ws(&t, &format!("ws-{i:02}"))).unwrap();
        }
        let got = list_active_siblings_for_project(&conn, &p, 20).unwrap();
        assert_eq!(got.len(), 20, "must cap at the requested limit");
    }

    #[test]
    fn list_active_siblings_orders_by_last_agent_run_then_created_at() {
        use crate::db::{agent_runs, threads};
        use crate::db::models::{AgentRun, Thread};

        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let p = seed_project(&conn);
        let t = seed_task_under(&conn, &p);

        // Three workspaces, created at distinct times.
        let mut old = make_ws(&t, "old");
        old.created_at = 1_000;
        let mut mid = make_ws(&t, "mid");
        mid.created_at = 2_000;
        let mut new = make_ws(&t, "new");
        new.created_at = 3_000;
        create(&conn, &old).unwrap();
        create(&conn, &mid).unwrap();
        create(&conn, &new).unwrap();

        // Give `old` a recent agent_run so it bubbles to the top by
        // last-run time; `new` and `mid` have no runs, so they
        // fall back to created_at order.
        let th = Thread {
            thread_id: new_id(),
            workspace_id: old.workspace_id.clone(),
            created_at: 1_500,
        };
        threads::create(&conn, &th).unwrap();
        let run = AgentRun {
            run_id: new_id(),
            thread_id: th.thread_id.clone(),
            prompt: "p".into(),
            status: "done".into(),
            started_at: 5_000,
            ended_at: Some(5_100),
            exit_code: Some(0),
            error_message: None,
            checkpoint_sha: None,
        };
        agent_runs::create(&conn, &run).unwrap();

        let got = list_active_siblings_for_project(&conn, &p, 20).unwrap();
        let ids: Vec<&str> = got.iter().map(|w| w.workspace_id.as_str()).collect();
        // `old` first (run @ 5000 beats both created_at values).
        // `new` (created 3000) before `mid` (2000), neither has a run.
        assert_eq!(
            ids,
            vec![old.workspace_id.as_str(), new.workspace_id.as_str(), mid.workspace_id.as_str()],
            "expected order: old (run), new (created 3000), mid (created 2000)"
        );
    }

    #[test]
    fn name_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let task_id = seed_task(&conn);
        let mut ws = make_ws(&task_id, "name");
        ws.name = "eminem".into();
        create(&conn, &ws).unwrap();
        assert_eq!(get(&conn, &ws.workspace_id).unwrap().name, "eminem");
    }
}
