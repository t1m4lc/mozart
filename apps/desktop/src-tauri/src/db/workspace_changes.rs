//! CRUD for the `workspace_changes` table — captured after each agent run.

use rusqlite::{params, Connection};

use crate::db::models::WorkspaceChange;
use crate::error::AppError;

pub fn insert(conn: &Connection, change: &WorkspaceChange) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO workspace_changes(workspace_id, run_id, diff_text, files_added, files_modified, files_deleted, captured_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            change.workspace_id, change.run_id, change.diff_text,
            change.files_added, change.files_modified, change.files_deleted, change.captured_at,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn latest_for_workspace(conn: &Connection, workspace_id: &str) -> Result<Option<WorkspaceChange>, AppError> {
    let result: Result<WorkspaceChange, _> = conn.query_row(
        "SELECT change_id, workspace_id, run_id, diff_text, files_added, files_modified, files_deleted, captured_at
         FROM workspace_changes WHERE workspace_id = ?1 ORDER BY captured_at DESC LIMIT 1",
        [workspace_id],
        |row| Ok(WorkspaceChange {
            change_id: row.get(0)?,
            workspace_id: row.get(1)?,
            run_id: row.get(2)?,
            diff_text: row.get(3)?,
            files_added: row.get(4)?,
            files_modified: row.get(5)?,
            files_deleted: row.get(6)?,
            captured_at: row.get(7)?,
        }),
    );
    match result {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};
    use crate::db::models::{Repo, Task, Workspace};

    fn seed_workspace(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms() };
        repos::create(conn, &r).unwrap();
        let t = Task { task_id: new_id(), repo_id: r.repo_id, title: "t".into(), task_text: "t".into(), status: "active".into(), created_at: now_ms() };
        tasks::create(conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(), task_id: t.task_id, worktree_path: format!("/wt-{}", new_id()),
            branch_name: "b".into(), base_branch: "main".into(),
            status: "ready".into(), created_at: now_ms(), deletion_intent: 0,
        };
        workspaces::create(conn, &ws).unwrap();
        ws.workspace_id
    }

    fn make_change(ws_id: &str, captured_at: i64) -> WorkspaceChange {
        WorkspaceChange {
            change_id: 0, // ignored on insert
            workspace_id: ws_id.to_string(),
            run_id: None,
            diff_text: "diff --git a/x b/x\n".to_string(),
            files_added: 1,
            files_modified: 0,
            files_deleted: 0,
            captured_at,
        }
    }

    #[test]
    fn insert_and_latest() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        insert(&conn, &make_change(&ws, 100)).unwrap();
        insert(&conn, &make_change(&ws, 200)).unwrap();
        insert(&conn, &make_change(&ws, 150)).unwrap();
        let latest = latest_for_workspace(&conn, &ws).unwrap().unwrap();
        assert_eq!(latest.captured_at, 200);
    }

    #[test]
    fn latest_returns_none_when_empty() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        assert!(latest_for_workspace(&conn, &ws).unwrap().is_none());
    }
}
