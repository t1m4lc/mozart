//! CRUD for the `agent_runs` table.

use rusqlite::{params, Connection};

use crate::db::models::AgentRun;
use crate::error::AppError;

pub fn create(conn: &Connection, run: &AgentRun) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO agent_runs(run_id, thread_id, prompt, status, started_at, ended_at, exit_code, error_message, checkpoint_sha, prompt_source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            run.run_id, run.thread_id, run.prompt, run.status,
            run.started_at, run.ended_at, run.exit_code, run.error_message, run.checkpoint_sha,
            run.prompt_source,
        ],
    )?;
    Ok(())
}

pub fn update_status(conn: &Connection, run_id: &str, status: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE agent_runs SET status = ?1 WHERE run_id = ?2",
        params![status, run_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("agent_run id={run_id}")));
    }
    Ok(())
}

/// Persist the pre-spawn checkpoint sha onto an existing `agent_runs` row.
/// Sibling of [`update_status`]; returns [`AppError::NotFound`] if no row
/// matched (D1.5-E).
pub fn update_checkpoint_sha(conn: &Connection, run_id: &str, sha: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE agent_runs SET checkpoint_sha = ?1 WHERE run_id = ?2",
        params![sha, run_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("agent_run id={run_id}")));
    }
    Ok(())
}

/// Set `ended_at`, `status`, `exit_code`, and optionally `error_message` in one update
/// — called when the agent process exits.
pub fn mark_ended(
    conn: &Connection,
    run_id: &str,
    status: &str,
    ended_at: i64,
    exit_code: Option<i64>,
    error_message: Option<&str>,
) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE agent_runs
         SET status = ?1, ended_at = ?2, exit_code = ?3, error_message = ?4
         WHERE run_id = ?5",
        params![status, ended_at, exit_code, error_message, run_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("agent_run id={run_id}")));
    }
    Ok(())
}

pub fn get(conn: &Connection, run_id: &str) -> Result<AgentRun, AppError> {
    conn.query_row(
        "SELECT run_id, thread_id, prompt, status, started_at, ended_at, exit_code, error_message, checkpoint_sha, prompt_source
         FROM agent_runs WHERE run_id = ?1",
        [run_id],
        row_to_run,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("agent_run id={run_id}")),
        other => other.into(),
    })
}

pub fn list_by_thread(conn: &Connection, thread_id: &str) -> Result<Vec<AgentRun>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT run_id, thread_id, prompt, status, started_at, ended_at, exit_code, error_message, checkpoint_sha, prompt_source
         FROM agent_runs WHERE thread_id = ?1 ORDER BY started_at ASC",
    )?;
    let rows = stmt.query_map([thread_id], row_to_run)?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

fn row_to_run(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRun> {
    Ok(AgentRun {
        run_id: row.get(0)?,
        thread_id: row.get(1)?,
        prompt: row.get(2)?,
        status: row.get(3)?,
        started_at: row.get(4)?,
        ended_at: row.get(5)?,
        exit_code: row.get(6)?,
        error_message: row.get(7)?,
        checkpoint_sha: row.get(8)?,
        prompt_source: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, threads, workspaces};
    use crate::db::models::{Repo, Task, Thread, Workspace};

    fn seed_thread(conn: &Connection) -> String {
        let r = Repo { repo_id: new_id(), path: format!("/r-{}", new_id()), display_name: "r".into(), added_at: now_ms(), icon: None, hidden: false, sort_index: 0, run_command: None };
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
        th.thread_id
    }

    fn make_run(thread_id: &str) -> AgentRun {
        AgentRun {
            run_id: new_id(),
            thread_id: thread_id.to_string(),
            prompt: "do the thing".into(),
            status: "initializing".into(),
            started_at: now_ms(),
            ended_at: None,
            exit_code: None,
            error_message: None,
            checkpoint_sha: Some("abc1234".into()),
            prompt_source: "message_content".into(),
        }
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let th = seed_thread(&conn);
        let run = make_run(&th);
        create(&conn, &run).unwrap();
        let got = get(&conn, &run.run_id).unwrap();
        assert_eq!(got.prompt, "do the thing");
        assert_eq!(got.checkpoint_sha.as_deref(), Some("abc1234"));
    }

    #[test]
    fn status_then_mark_ended() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let th = seed_thread(&conn);
        let run = make_run(&th);
        create(&conn, &run).unwrap();
        update_status(&conn, &run.run_id, "running").unwrap();
        mark_ended(&conn, &run.run_id, "done", now_ms(), Some(0), None).unwrap();
        let got = get(&conn, &run.run_id).unwrap();
        assert_eq!(got.status, "done");
        assert_eq!(got.exit_code, Some(0));
        assert!(got.ended_at.is_some());
    }

    #[test]
    fn update_checkpoint_sha_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let th = seed_thread(&conn);
        let mut run = make_run(&th);
        run.checkpoint_sha = None; // start unset to prove the UPDATE writes it
        create(&conn, &run).unwrap();
        update_checkpoint_sha(&conn, &run.run_id, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef").unwrap();
        let got = get(&conn, &run.run_id).unwrap();
        assert_eq!(
            got.checkpoint_sha.as_deref(),
            Some("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
        );
    }

    #[test]
    fn update_checkpoint_sha_missing_row_is_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = update_checkpoint_sha(&conn, "no-such-run", "abc").unwrap_err();
        match err {
            AppError::NotFound(_) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }

    #[test]
    fn list_by_thread_orders_by_started_at_asc() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let th = seed_thread(&conn);
        let mut a = make_run(&th); a.started_at = 1;
        let mut b = make_run(&th); b.started_at = 2;
        create(&conn, &a).unwrap();
        create(&conn, &b).unwrap();
        let got = list_by_thread(&conn, &th).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].started_at, 1);
        assert_eq!(got[1].started_at, 2);
    }
}
