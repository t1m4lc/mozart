//! CRUD for the `messages` table.

use rusqlite::{params, Connection};

use crate::db::models::Message;
use crate::error::AppError;

const COLS: &str =
    "message_id, chat_id, run_id, role, content, mode, status, timeline_json, created_at";

pub fn insert(conn: &Connection, msg: &Message) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO messages(message_id, chat_id, run_id, role, content, mode, status, timeline_json, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            msg.message_id,
            msg.chat_id,
            msg.run_id,
            msg.role,
            msg.content,
            msg.mode,
            msg.status,
            msg.timeline_json,
            msg.created_at,
        ],
    )?;
    Ok(())
}

pub fn list_for_chat(conn: &Connection, chat_id: &str) -> Result<Vec<Message>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM messages WHERE chat_id = ?1 ORDER BY created_at ASC, message_id ASC"
    ))?;
    let rows = stmt.query_map([chat_id], row_to_message)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn update_content(
    conn: &Connection,
    message_id: &str,
    content: &str,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE messages SET content = ?2 WHERE message_id = ?1",
        params![message_id, content],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("message_id={message_id}")));
    }
    Ok(())
}

pub fn update_status(
    conn: &Connection,
    message_id: &str,
    status: &str,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE messages SET status = ?2 WHERE message_id = ?1",
        params![message_id, status],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("message_id={message_id}")));
    }
    Ok(())
}

pub fn update_timeline(
    conn: &Connection,
    message_id: &str,
    timeline_json: Option<&str>,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE messages SET timeline_json = ?2 WHERE message_id = ?1",
        params![message_id, timeline_json],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("message_id={message_id}")));
    }
    Ok(())
}

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        message_id: row.get(0)?,
        chat_id: row.get(1)?,
        run_id: row.get(2)?,
        role: row.get(3)?,
        content: row.get(4)?,
        mode: row.get(5)?,
        status: row.get(6)?,
        timeline_json: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::chats;
    use crate::db::models::{Chat, Repo, Task, Workspace};
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};

    fn seed_chat(conn: &Connection) -> String {
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
        let c = Chat {
            chat_id: new_id(),
            workspace_id: ws.workspace_id,
            title: "Untitled".into(),
            llm_id: None,
            mode: "agent".into(),
            effort: "medium".into(),
            last_read_message_id: None,
            closed_at: None,
            created_at: now_ms(),
        };
        chats::create(conn, &c).unwrap();
        c.chat_id
    }

    fn make_msg(chat_id: &str, role: &str, ts: i64) -> Message {
        Message {
            message_id: new_id(),
            chat_id: chat_id.into(),
            run_id: None,
            role: role.into(),
            content: "hello".into(),
            mode: Some("normal".into()),
            status: "done".into(),
            timeline_json: None,
            created_at: ts,
        }
    }

    #[test]
    fn round_trip_and_order() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let chat_id = seed_chat(&conn);
        let m1 = make_msg(&chat_id, "user", 1);
        let m2 = make_msg(&chat_id, "assistant", 2);
        insert(&conn, &m1).unwrap();
        insert(&conn, &m2).unwrap();
        let got = list_for_chat(&conn, &chat_id).unwrap();
        let ids: Vec<_> = got.iter().map(|m| m.message_id.clone()).collect();
        assert_eq!(ids, vec![m1.message_id, m2.message_id]);
    }

    #[test]
    fn update_content_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let chat_id = seed_chat(&conn);
        let m = make_msg(&chat_id, "assistant", now_ms());
        insert(&conn, &m).unwrap();
        update_content(&conn, &m.message_id, "updated").unwrap();
        let got = list_for_chat(&conn, &chat_id).unwrap();
        assert_eq!(got[0].content, "updated");
    }

    #[test]
    fn update_status_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let chat_id = seed_chat(&conn);
        let m = make_msg(&chat_id, "assistant", now_ms());
        insert(&conn, &m).unwrap();
        update_status(&conn, &m.message_id, "stopped").unwrap();
        let got = list_for_chat(&conn, &chat_id).unwrap();
        assert_eq!(got[0].status, "stopped");
    }

    #[test]
    fn update_timeline_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let chat_id = seed_chat(&conn);
        let m = make_msg(&chat_id, "assistant", now_ms());
        insert(&conn, &m).unwrap();
        update_timeline(&conn, &m.message_id, Some(r#"{"summary":"x"}"#)).unwrap();
        let got = list_for_chat(&conn, &chat_id).unwrap();
        assert_eq!(got[0].timeline_json.as_deref(), Some(r#"{"summary":"x"}"#));
    }

    #[test]
    fn update_unknown_returns_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        assert!(matches!(
            update_status(&conn, "no-such", "done"),
            Err(AppError::NotFound(_))
        ));
    }
}
