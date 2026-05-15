//! CRUD for the `threads` table — 1:1 with workspaces in v0.0.1.

use rusqlite::{params, Connection};

use crate::db::models::Thread;
use crate::error::AppError;

pub fn create(conn: &Connection, thread: &Thread) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO threads(thread_id, workspace_id, created_at) VALUES (?1, ?2, ?3)",
        params![thread.thread_id, thread.workspace_id, thread.created_at],
    )?;
    Ok(())
}

pub fn get_by_workspace(conn: &Connection, workspace_id: &str) -> Result<Thread, AppError> {
    conn.query_row(
        "SELECT thread_id, workspace_id, created_at FROM threads WHERE workspace_id = ?1",
        [workspace_id],
        |row| Ok(Thread {
            thread_id: row.get(0)?,
            workspace_id: row.get(1)?,
            created_at: row.get(2)?,
        }),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("thread workspace_id={workspace_id}"))
        }
        other => other.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};
    use crate::db::models::{Repo, Task, Workspace};

    fn seed_workspace(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms(), icon: None, hidden: false, sort_index: 0, run_command: None };
        repos::create(conn, &r).unwrap();
        let t = Task { task_id: new_id(), repo_id: r.repo_id.clone(), title: "t".into(), task_text: "t".into(), status: "active".into(), created_at: now_ms() };
        tasks::create(conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(),
            task_id: t.task_id,
            name: "ws-x".into(),
            worktree_path: format!("/wt-{}", new_id()),
            branch_name: "agent/wip-x".into(),
            base_branch: "main".into(),
            status: "initializing".into(),
            pinned: false,
            unread: false,
            created_at: now_ms(),
            deletion_intent: 0,
            ui_status: "backlog".into(),
        };
        workspaces::create(conn, &ws).unwrap();
        ws.workspace_id
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws_id = seed_workspace(&conn);
        let th = Thread { thread_id: new_id(), workspace_id: ws_id.clone(), created_at: now_ms() };
        create(&conn, &th).unwrap();
        let got = get_by_workspace(&conn, &ws_id).unwrap();
        assert_eq!(got.thread_id, th.thread_id);
    }

    #[test]
    fn unique_per_workspace_enforced() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws_id = seed_workspace(&conn);
        let th1 = Thread { thread_id: new_id(), workspace_id: ws_id.clone(), created_at: now_ms() };
        create(&conn, &th1).unwrap();
        // Schema declares workspace_id UNIQUE on threads — second insert must fail.
        let th2 = Thread { thread_id: new_id(), workspace_id: ws_id, created_at: now_ms() };
        let err = create(&conn, &th2).unwrap_err();
        assert!(matches!(err, AppError::Db(_)));
    }
}
