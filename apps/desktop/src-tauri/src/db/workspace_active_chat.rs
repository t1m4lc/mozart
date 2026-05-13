//! CRUD for `workspace_active_chat` — single-row-per-workspace pointer
//! to the chat the tab bar should reopen.

use rusqlite::{params, Connection};

use crate::error::AppError;

pub fn set(conn: &Connection, workspace_id: &str, chat_id: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspace_active_chat(workspace_id, chat_id) VALUES (?1, ?2) \
         ON CONFLICT(workspace_id) DO UPDATE SET chat_id = excluded.chat_id",
        params![workspace_id, chat_id],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, workspace_id: &str) -> Result<Option<String>, AppError> {
    let r: rusqlite::Result<String> = conn.query_row(
        "SELECT chat_id FROM workspace_active_chat WHERE workspace_id = ?1",
        [workspace_id],
        |r| r.get(0),
    );
    match r {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::chats;
    use crate::db::models::{Chat, Repo, Task, Workspace};
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};

    fn seed_workspace_with_chats(conn: &Connection) -> (String, String, String) {
        let r = Repo {
            repo_id: new_id(),
            path: format!("/r-{}", new_id()),
            display_name: "r".into(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
        };
        repos::create(conn, &r).unwrap();
        let t = Task {
            task_id: new_id(),
            repo_id: r.repo_id,
            title: "t".into(),
            task_text: "t".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        tasks::create(conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(),
            task_id: t.task_id,
            name: "ws".into(),
            worktree_path: format!("/wt-{}", new_id()),
            branch_name: "agent/wip".into(),
            base_branch: "main".into(),
            status: "ready".into(),
            pinned: false,
            unread: false,
            created_at: now_ms(),
            deletion_intent: 0,
            ui_status: "backlog".into(),
        };
        workspaces::create(conn, &ws).unwrap();
        let c1 = Chat {
            chat_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            title: "a".into(),
            llm_id: None,
            closed_at: None,
            created_at: now_ms(),
        };
        let c2 = Chat {
            chat_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            title: "b".into(),
            llm_id: None,
            closed_at: None,
            created_at: now_ms() + 1,
        };
        chats::create(conn, &c1).unwrap();
        chats::create(conn, &c2).unwrap();
        (ws.workspace_id, c1.chat_id, c2.chat_id)
    }

    #[test]
    fn get_returns_none_when_unset() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let (ws_id, _, _) = seed_workspace_with_chats(&conn);
        assert_eq!(get(&conn, &ws_id).unwrap(), None);
    }

    #[test]
    fn set_then_get() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let (ws_id, c1, _) = seed_workspace_with_chats(&conn);
        set(&conn, &ws_id, &c1).unwrap();
        assert_eq!(get(&conn, &ws_id).unwrap().as_deref(), Some(c1.as_str()));
    }

    #[test]
    fn set_is_idempotent_and_overwrites() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let (ws_id, c1, c2) = seed_workspace_with_chats(&conn);
        set(&conn, &ws_id, &c1).unwrap();
        set(&conn, &ws_id, &c2).unwrap();
        assert_eq!(get(&conn, &ws_id).unwrap().as_deref(), Some(c2.as_str()));
    }
}
