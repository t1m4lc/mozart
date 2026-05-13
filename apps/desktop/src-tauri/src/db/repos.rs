//! CRUD for the `repos` table.

use rusqlite::{params, Connection};

use crate::db::models::Repo;
use crate::error::AppError;

const COLS: &str =
    "repo_id, path, display_name, added_at, icon, hidden, sort_index";

pub fn create(conn: &Connection, repo: &Repo) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO repos(repo_id, path, display_name, added_at, icon, hidden, sort_index) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            repo.repo_id,
            repo.path,
            repo.display_name,
            repo.added_at,
            repo.icon,
            repo.hidden as i64,
            repo.sort_index,
        ],
    )?;
    Ok(())
}

pub fn get_by_path(conn: &Connection, path: &str) -> Result<Repo, AppError> {
    conn.query_row(
        &format!("SELECT {COLS} FROM repos WHERE path = ?1"),
        [path],
        row_to_repo,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("repo path={path}")),
        other => other.into(),
    })
}

pub fn get(conn: &Connection, repo_id: &str) -> Result<Repo, AppError> {
    conn.query_row(
        &format!("SELECT {COLS} FROM repos WHERE repo_id = ?1"),
        [repo_id],
        row_to_repo,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("repo_id={repo_id}")),
        other => other.into(),
    })
}

/// Ordered by (sort_index ASC, added_at DESC). New rows default to
/// sort_index=0, so the first reorder is what introduces a stable
/// order; before that, the secondary key keeps newest-first behaviour.
pub fn list(conn: &Connection) -> Result<Vec<Repo>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM repos ORDER BY sort_index ASC, added_at DESC"
    ))?;
    let rows = stmt.query_map([], row_to_repo)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn set_icon(conn: &Connection, repo_id: &str, icon: Option<&str>) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE repos SET icon = ?2 WHERE repo_id = ?1",
        params![repo_id, icon],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("repo_id={repo_id}")));
    }
    Ok(())
}

pub fn set_hidden(conn: &Connection, repo_id: &str, hidden: bool) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE repos SET hidden = ?2 WHERE repo_id = ?1",
        params![repo_id, hidden as i64],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("repo_id={repo_id}")));
    }
    Ok(())
}

/// Apply a full ordering. `ordered_ids[i]` gets `sort_index = i`. IDs
/// not in the input keep their current sort_index. Runs in one tx.
pub fn set_sort(conn: &mut Connection, ordered_ids: &[String]) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE repos SET sort_index = ?2 WHERE repo_id = ?1",
            params![id, i as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Hard delete. FK cascades aren't declared on the schema, so this
/// function deletes the dependent rows in dependency order inside a
/// single transaction. Tables touched (leaf-first):
///   agent_events  -> agent_runs -> messages -> chats
///   -> workspace_active_chat -> workspace_changes -> threads
///   -> workspaces -> tasks -> repos
/// Any pre-existing orphan (a leaf row whose parent already vanished)
/// is still removed because the predicate joins back to repo_id.
pub fn delete(conn: &mut Connection, repo_id: &str) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    // 1. agent_events (events of runs of threads of workspaces of tasks of this repo)
    tx.execute(
        "DELETE FROM agent_events WHERE run_id IN (
            SELECT r.run_id FROM agent_runs r
            JOIN threads th ON th.thread_id = r.thread_id
            JOIN workspaces ws ON ws.workspace_id = th.workspace_id
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 2. agent_runs
    tx.execute(
        "DELETE FROM agent_runs WHERE thread_id IN (
            SELECT th.thread_id FROM threads th
            JOIN workspaces ws ON ws.workspace_id = th.workspace_id
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 3. messages (chat-side; only present once migration 004 ran)
    tx.execute(
        "DELETE FROM messages WHERE chat_id IN (
            SELECT c.chat_id FROM chats c
            JOIN workspaces ws ON ws.workspace_id = c.workspace_id
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 4. workspace_active_chat
    tx.execute(
        "DELETE FROM workspace_active_chat WHERE workspace_id IN (
            SELECT ws.workspace_id FROM workspaces ws
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 5. chats
    tx.execute(
        "DELETE FROM chats WHERE workspace_id IN (
            SELECT ws.workspace_id FROM workspaces ws
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 6. workspace_changes
    tx.execute(
        "DELETE FROM workspace_changes WHERE workspace_id IN (
            SELECT ws.workspace_id FROM workspaces ws
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 7. threads
    tx.execute(
        "DELETE FROM threads WHERE workspace_id IN (
            SELECT ws.workspace_id FROM workspaces ws
            JOIN tasks t ON t.task_id = ws.task_id
            WHERE t.repo_id = ?1
        )",
        [repo_id],
    )?;
    // 8. workspaces
    tx.execute(
        "DELETE FROM workspaces WHERE task_id IN (
            SELECT task_id FROM tasks WHERE repo_id = ?1
        )",
        [repo_id],
    )?;
    // 9. tasks
    tx.execute("DELETE FROM tasks WHERE repo_id = ?1", [repo_id])?;
    // 10. repos
    let n = tx.execute("DELETE FROM repos WHERE repo_id = ?1", [repo_id])?;
    if n == 0 {
        return Err(AppError::NotFound(format!("repo_id={repo_id}")));
    }
    tx.commit()?;
    Ok(())
}

fn row_to_repo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Repo> {
    Ok(Repo {
        repo_id: row.get(0)?,
        path: row.get(1)?,
        display_name: row.get(2)?,
        added_at: row.get(3)?,
        icon: row.get(4)?,
        hidden: row.get::<_, i64>(5)? != 0,
        sort_index: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms};

    fn sample(path: &str) -> Repo {
        Repo {
            repo_id: new_id(),
            path: path.to_string(),
            display_name: "test repo".to_string(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
        }
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let r = sample("/tmp/test-repo");
        create(&conn, &r).unwrap();
        let got = get_by_path(&conn, "/tmp/test-repo").unwrap();
        assert_eq!(got.repo_id, r.repo_id);
        assert_eq!(got.display_name, "test repo");
        assert_eq!(got.icon, None);
        assert!(!got.hidden);
        assert_eq!(got.sort_index, 0);
    }

    #[test]
    fn not_found_returns_app_error() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = get_by_path(&conn, "/nope").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn get_by_id_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let r = sample("/tmp/test-repo-id");
        create(&conn, &r).unwrap();
        let got = get(&conn, &r.repo_id).unwrap();
        assert_eq!(got.repo_id, r.repo_id);
        assert_eq!(got.path, "/tmp/test-repo-id");
        assert_eq!(got.display_name, "test repo");
    }

    #[test]
    fn get_by_id_not_found_returns_app_error() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = get(&conn, "no-such-id").unwrap_err();
        match err {
            AppError::NotFound(msg) => assert!(msg.contains("no-such-id"),
                "expected error message to mention the missing id, got: {msg}"),
            other => panic!("expected AppError::NotFound, got {other:?}"),
        }
    }

    #[test]
    fn list_orders_by_added_at_desc_when_sort_index_tied() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let mut a = sample("/a");
        a.added_at = 1;
        let mut b = sample("/b");
        b.added_at = 2;
        create(&conn, &a).unwrap();
        create(&conn, &b).unwrap();
        let got = list(&conn).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].path, "/b"); // newer first
    }

    #[test]
    fn set_icon_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let r = sample("/i");
        create(&conn, &r).unwrap();
        set_icon(&conn, &r.repo_id, Some("🎵")).unwrap();
        assert_eq!(get(&conn, &r.repo_id).unwrap().icon.as_deref(), Some("🎵"));
        set_icon(&conn, &r.repo_id, None).unwrap();
        assert_eq!(get(&conn, &r.repo_id).unwrap().icon, None);
    }

    #[test]
    fn set_hidden_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let r = sample("/h");
        create(&conn, &r).unwrap();
        set_hidden(&conn, &r.repo_id, true).unwrap();
        assert!(get(&conn, &r.repo_id).unwrap().hidden);
        set_hidden(&conn, &r.repo_id, false).unwrap();
        assert!(!get(&conn, &r.repo_id).unwrap().hidden);
    }

    #[test]
    fn set_sort_applies_ordering_and_list_respects_it() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let mut a = sample("/a");
        a.added_at = 10;
        let mut b = sample("/b");
        b.added_at = 20;
        let mut c = sample("/c");
        c.added_at = 30;
        create(&conn, &a).unwrap();
        create(&conn, &b).unwrap();
        create(&conn, &c).unwrap();
        set_sort(
            &mut conn,
            &[b.repo_id.clone(), c.repo_id.clone(), a.repo_id.clone()],
        )
        .unwrap();
        let got = list(&conn).unwrap();
        assert_eq!(got[0].path, "/b");
        assert_eq!(got[1].path, "/c");
        assert_eq!(got[2].path, "/a");
    }

    #[test]
    fn delete_removes_row() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let r = sample("/d");
        create(&conn, &r).unwrap();
        delete(&mut conn, &r.repo_id).unwrap();
        assert!(matches!(
            get(&conn, &r.repo_id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_unknown_returns_not_found() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        assert!(matches!(
            delete(&mut conn, "no-such-id"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_cascades_through_workspaces_tasks_threads_chats() {
        use crate::db::models::{Chat, Message, Task, Thread, Workspace};
        use crate::db::{chats, messages, tasks, threads, workspaces};

        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let r = sample("/cascade");
        create(&conn, &r).unwrap();
        let t = Task {
            task_id: new_id(),
            repo_id: r.repo_id.clone(),
            title: "t".into(),
            task_text: "t".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        tasks::create(&conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(),
            task_id: t.task_id.clone(),
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
        workspaces::create(&conn, &ws).unwrap();
        let th = Thread {
            thread_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            created_at: now_ms(),
        };
        threads::create(&conn, &th).unwrap();
        let c = Chat {
            chat_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            title: "Untitled".into(),
            llm_id: None,
            closed_at: None,
            created_at: now_ms(),
        };
        chats::create(&conn, &c).unwrap();
        let m = Message {
            message_id: new_id(),
            chat_id: c.chat_id.clone(),
            run_id: None,
            role: "user".into(),
            content: "hi".into(),
            mode: None,
            status: "done".into(),
            timeline_json: None,
            created_at: now_ms(),
        };
        messages::insert(&conn, &m).unwrap();

        delete(&mut conn, &r.repo_id).unwrap();

        // All descendant rows must be gone.
        let n_msg: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .unwrap();
        let n_chat: i64 = conn
            .query_row("SELECT COUNT(*) FROM chats", [], |row| row.get(0))
            .unwrap();
        let n_th: i64 = conn
            .query_row("SELECT COUNT(*) FROM threads", [], |row| row.get(0))
            .unwrap();
        let n_ws: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
            .unwrap();
        let n_t: i64 = conn
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .unwrap();
        let n_r: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            (n_msg, n_chat, n_th, n_ws, n_t, n_r),
            (0, 0, 0, 0, 0, 0),
            "expected full cascade"
        );
    }
}
