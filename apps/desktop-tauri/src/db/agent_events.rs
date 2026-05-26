//! CRUD for the `agent_events` table — high-volume insert path.

use rusqlite::{params, Connection};

use crate::db::models::AgentEvent;
use crate::error::AppError;

/// Insert one event. Returns the auto-incremented event_id.
pub fn insert(
    conn: &Connection,
    run_id: &str,
    event_type: &str,
    payload_json: &str,
    ts: i64,
) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO agent_events(run_id, event_type, payload_json, ts) VALUES (?1, ?2, ?3, ?4)",
        params![run_id, event_type, payload_json, ts],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_by_run(conn: &Connection, run_id: &str) -> Result<Vec<AgentEvent>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT event_id, run_id, event_type, payload_json, ts
         FROM agent_events WHERE run_id = ?1 ORDER BY ts ASC, event_id ASC",
    )?;
    let rows = stmt.query_map([run_id], |row| {
        Ok(AgentEvent {
            event_id: row.get(0)?,
            run_id: row.get(1)?,
            event_type: row.get(2)?,
            payload_json: row.get(3)?,
            ts: row.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{agent_runs, init_db_memory, new_id, now_ms, repos, tasks, threads, workspaces};
    use crate::db::models::{AgentRun, Repo, Task, Thread, Workspace};

    fn seed_run(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms(), icon: None, hidden: false, sort_index: 0, run_command: None, setup_command: None };
        repos::create(conn, &r).unwrap();
        let t = Task { task_id: new_id(), repo_id: r.repo_id, title: "t".into(), task_text: "t".into(), status: "active".into(), created_at: now_ms() };
        tasks::create(conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(), task_id: t.task_id, name: "ws-x".into(),
            worktree_path: format!("/wt-{}", new_id()),
            branch_name: "agent/wip-x".into(), base_branch: "main".into(),
            status: "ready".into(), pinned: false, unread: false,
            created_at: now_ms(), deletion_intent: 0, ui_status: "backlog".into(),
 last_merge_action: None,
 sandbox_level: "L2Project".into(),
        };
        workspaces::create(conn, &ws).unwrap();
        let th = Thread { thread_id: new_id(), workspace_id: ws.workspace_id, created_at: now_ms() };
        threads::create(conn, &th).unwrap();
        let run = AgentRun {
            run_id: new_id(), thread_id: th.thread_id, prompt: "p".into(),
            status: "running".into(), started_at: now_ms(),
            ended_at: None, exit_code: None, error_message: None, checkpoint_sha: None,
            prompt_source: "message_content".into(),
        };
        agent_runs::create(conn, &run).unwrap();
        run.run_id
    }

    #[test]
    fn insert_returns_rowid_and_lists_in_order() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let run_id = seed_run(&conn);
        let id1 = insert(&conn, &run_id, "stream_token", r#"{"text":"hi"}"#, 100).unwrap();
        let id2 = insert(&conn, &run_id, "stream_token", r#"{"text":"there"}"#, 200).unwrap();
        assert!(id2 > id1);
        let events = list_by_run(&conn, &run_id).unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].ts, 100);
        assert_eq!(events[1].ts, 200);
    }

    #[test]
    fn high_volume_insert() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let run_id = seed_run(&conn);
        let base = now_ms();
        for i in 0..100 {
            insert(&conn, &run_id, "stream_token", "{}", base + i as i64).unwrap();
        }
        let events = list_by_run(&conn, &run_id).unwrap();
        assert_eq!(events.len(), 100);
        // ordering check on first 3 + last 1
        assert_eq!(events[0].ts, base);
        assert_eq!(events[99].ts, base + 99);
    }

    #[test]
    fn fk_to_run_enforced() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = insert(&conn, "no-such-run", "stream_token", "{}", now_ms()).unwrap_err();
        assert!(matches!(err, AppError::Db(_)));
    }
}
