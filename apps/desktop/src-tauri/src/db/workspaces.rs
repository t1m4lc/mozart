//! CRUD for the `workspaces` table — the busiest model in v0.0.1.

use rusqlite::{params, Connection};

use crate::db::models::Workspace;
use crate::error::AppError;

pub fn create(conn: &Connection, ws: &Workspace) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspaces(workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![ws.workspace_id, ws.task_id, ws.worktree_path, ws.branch_name, ws.base_branch, ws.status, ws.created_at, ws.deletion_intent],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, workspace_id: &str) -> Result<Workspace, AppError> {
    conn.query_row(
        "SELECT workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent
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
        "SELECT workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent
         FROM workspaces WHERE task_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([task_id], row_to_workspace)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

pub fn list_all(conn: &Connection) -> Result<Vec<Workspace>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent
         FROM workspaces ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_workspace)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
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

fn row_to_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        workspace_id: row.get(0)?,
        task_id: row.get(1)?,
        worktree_path: row.get(2)?,
        branch_name: row.get(3)?,
        base_branch: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
        deletion_intent: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks};
    use crate::db::models::{Repo, Task};

    fn seed_task(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms() };
        repos::create(conn, &r).unwrap();
        let t = Task { task_id: new_id(), repo_id: r.repo_id, title: "t".into(), task_text: "t".into(), status: "active".into(), created_at: now_ms() };
        tasks::create(conn, &t).unwrap();
        t.task_id
    }

    fn make_ws(task_id: &str, suffix: &str) -> Workspace {
        Workspace {
            workspace_id: new_id(),
            task_id: task_id.to_string(),
            worktree_path: format!("/wt-{suffix}-{}", new_id()),
            branch_name: format!("agent/wip-{suffix}"),
            base_branch: "main".into(),
            status: "initializing".into(),
            created_at: now_ms(),
            deletion_intent: 0,
        }
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
    fn update_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = update_status(&conn, "no-such-ws", "done").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
