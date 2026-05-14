//! CRUD for the `chats` table.

use rusqlite::{params, Connection};

use crate::db::models::Chat;
use crate::error::AppError;

const COLS: &str = "chat_id, workspace_id, title, llm_id, closed_at, created_at";

pub fn create(conn: &Connection, chat: &Chat) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO chats(chat_id, workspace_id, title, llm_id, closed_at, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            chat.chat_id,
            chat.workspace_id,
            chat.title,
            chat.llm_id,
            chat.closed_at,
            chat.created_at,
        ],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, chat_id: &str) -> Result<Chat, AppError> {
    conn.query_row(
        &format!("SELECT {COLS} FROM chats WHERE chat_id = ?1"),
        [chat_id],
        row_to_chat,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("chat_id={chat_id}")),
        other => other.into(),
    })
}

/// Open chats for a workspace, oldest-first (tab bar reads l→r).
pub fn list_open_for_workspace(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<Chat>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM chats WHERE workspace_id = ?1 AND closed_at IS NULL \
         ORDER BY created_at ASC"
    ))?;
    let rows = stmt.query_map([workspace_id], row_to_chat)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// All open chats across every workspace, newest first. Backs the
/// sidebar "Chats" group introduced in Phase 1: the UI buckets by
/// created_at into Today / Yesterday / This week / Older.
pub fn list_all_open(conn: &Connection) -> Result<Vec<Chat>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM chats WHERE closed_at IS NULL \
         ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map([], row_to_chat)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn set_title(conn: &Connection, chat_id: &str, title: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE chats SET title = ?2 WHERE chat_id = ?1",
        params![chat_id, title],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("chat_id={chat_id}")));
    }
    Ok(())
}

pub fn close(conn: &Connection, chat_id: &str, closed_at: i64) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE chats SET closed_at = ?2 WHERE chat_id = ?1",
        params![chat_id, closed_at],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("chat_id={chat_id}")));
    }
    Ok(())
}

fn row_to_chat(row: &rusqlite::Row<'_>) -> rusqlite::Result<Chat> {
    Ok(Chat {
        chat_id: row.get(0)?,
        workspace_id: row.get(1)?,
        title: row.get(2)?,
        llm_id: row.get(3)?,
        closed_at: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{Repo, Task, Workspace};
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};

    fn seed_workspace(conn: &Connection) -> String {
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
        ws.workspace_id
    }

    fn make_chat(workspace_id: &str, created_at: i64) -> Chat {
        Chat {
            chat_id: new_id(),
            workspace_id: workspace_id.into(),
            title: "Untitled".into(),
            llm_id: None,
            closed_at: None,
            created_at,
        }
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        let c = make_chat(&ws, now_ms());
        create(&conn, &c).unwrap();
        let got = get(&conn, &c.chat_id).unwrap();
        assert_eq!(got.workspace_id, ws);
        assert_eq!(got.title, "Untitled");
    }

    #[test]
    fn list_open_filters_closed_and_orders_by_created_at() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        let a = make_chat(&ws, 10);
        let b = make_chat(&ws, 20);
        let c = make_chat(&ws, 30);
        create(&conn, &a).unwrap();
        create(&conn, &b).unwrap();
        create(&conn, &c).unwrap();
        close(&conn, &b.chat_id, now_ms()).unwrap();
        let open = list_open_for_workspace(&conn, &ws).unwrap();
        let ids: Vec<_> = open.iter().map(|c| c.chat_id.clone()).collect();
        assert_eq!(ids, vec![a.chat_id, c.chat_id]);
    }

    #[test]
    fn set_title_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        let c = make_chat(&ws, now_ms());
        create(&conn, &c).unwrap();
        set_title(&conn, &c.chat_id, "design").unwrap();
        assert_eq!(get(&conn, &c.chat_id).unwrap().title, "design");
    }

    #[test]
    fn set_title_missing_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        assert!(matches!(
            set_title(&conn, "no-such", "x"),
            Err(AppError::NotFound(_))
        ));
    }
}
