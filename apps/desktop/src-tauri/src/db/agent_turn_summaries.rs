//! CRUD for `agent_turn_summaries`.
//!
//! Compact deterministic distillation of one completed assistant turn.
//! Written once by the post-run hook in the runner supervisor from
//! `timeline_json` + `agent_events` for the just-finished run. The
//! ContextCompiler reads these rows into the envelope's
//! `operational_summaries` layer so the next turn sees a working-state
//! reconstruction instead of a raw stream replay.
//!
//! The summary builder itself is a pure function in
//! `claude_cli/summary_builder.rs` (T7). This module is just the
//! persistence boundary.

use rusqlite::{params, Connection};

use crate::db::models::AgentTurnSummary;
use crate::error::AppError;

const COLS: &str =
    "summary_id, run_id, message_id, chat_id, files_read_json, \
     files_edited_json, commands_run_json, key_results_json, \
     text_summary, created_at";

pub fn insert(conn: &Connection, s: &AgentTurnSummary) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO agent_turn_summaries(summary_id, run_id, message_id, chat_id, \
         files_read_json, files_edited_json, commands_run_json, key_results_json, \
         text_summary, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            s.summary_id, s.run_id, s.message_id, s.chat_id,
            s.files_read_json, s.files_edited_json,
            s.commands_run_json, s.key_results_json,
            s.text_summary, s.created_at,
        ],
    )?;
    Ok(())
}

/// All summaries for a chat, oldest-first, with a stable tiebreaker
/// on `summary_id`. The ContextCompiler walks this list to pick the
/// summaries it needs for `operational_summaries`; the budget layer
/// decides how many recent turns stay verbose vs collapse into the
/// summary form.
pub fn list_for_chat(
    conn: &Connection,
    chat_id: &str,
) -> Result<Vec<AgentTurnSummary>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM agent_turn_summaries \
         WHERE chat_id = ?1 \
         ORDER BY created_at ASC, summary_id ASC"
    ))?;
    let rows = stmt.query_map([chat_id], row_to_summary)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Debug/audit lookup. Returns `Ok(None)` (not `NotFound`) when no
/// summary exists — that's the normal case for runs that errored
/// before the post-run hook fired, and v1's summary builder is
/// best-effort.
pub fn get_by_run(
    conn: &Connection,
    run_id: &str,
) -> Result<Option<AgentTurnSummary>, AppError> {
    let res = conn.query_row(
        &format!("SELECT {COLS} FROM agent_turn_summaries WHERE run_id = ?1"),
        [run_id],
        row_to_summary,
    );
    match res {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(other) => Err(other.into()),
    }
}

fn row_to_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentTurnSummary> {
    Ok(AgentTurnSummary {
        summary_id: row.get(0)?,
        run_id: row.get(1)?,
        message_id: row.get(2)?,
        chat_id: row.get(3)?,
        files_read_json: row.get(4)?,
        files_edited_json: row.get(5)?,
        commands_run_json: row.get(6)?,
        key_results_json: row.get(7)?,
        text_summary: row.get(8)?,
        created_at: row.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::messages;
    use crate::db::models::{AgentRun, Chat, Message, Repo, Task, Thread, Workspace};
    use crate::db::{
        agent_runs, chats, init_db_memory, new_id, now_ms, repos, tasks, threads,
        workspaces,
    };

    /// repo -> task -> workspace -> thread -> chat -> assistant message -> agent_run.
    /// Returns the IDs needed to build an `AgentTurnSummary`.
    struct Seed {
        chat_id: String,
        message_id: String,
        run_id: String,
    }

    fn seed(conn: &Connection) -> Seed {
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
            branch_name: "agent/wip-x".into(),
            base_branch: "main".into(),
            status: "ready".into(),
            pinned: false,
            unread: false,
            created_at: now_ms(),
            deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
        };
        workspaces::create(conn, &ws).unwrap();
        let th = Thread {
            thread_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            created_at: now_ms(),
        };
        threads::create(conn, &th).unwrap();
        let chat = Chat {
            chat_id: new_id(),
            workspace_id: ws.workspace_id,
            title: "c".into(),
            llm_id: None,
            mode: "agent".into(),
            effort: "medium".into(),
            last_read_message_id: None,
            closed_at: None,
            created_at: now_ms(),
        };
        chats::create(conn, &chat).unwrap();
        let run = AgentRun {
            run_id: new_id(),
            thread_id: th.thread_id,
            prompt: "p".into(),
            status: "done".into(),
            started_at: now_ms(),
            ended_at: Some(now_ms()),
            exit_code: Some(0),
            error_message: None,
            checkpoint_sha: None,
        };
        agent_runs::create(conn, &run).unwrap();
        let msg = Message {
            message_id: new_id(),
            chat_id: chat.chat_id.clone(),
            run_id: Some(run.run_id.clone()),
            role: "assistant".into(),
            content: "hi".into(),
            mode: Some("agent".into()),
            status: "done".into(),
            timeline_json: None,
            created_at: now_ms(),
        };
        messages::insert(conn, &msg).unwrap();
        Seed {
            chat_id: chat.chat_id,
            message_id: msg.message_id,
            run_id: run.run_id,
        }
    }

    fn make_summary(s: &Seed, created_at: i64) -> AgentTurnSummary {
        AgentTurnSummary {
            summary_id: new_id(),
            run_id: s.run_id.clone(),
            message_id: s.message_id.clone(),
            chat_id: s.chat_id.clone(),
            files_read_json: Some("[\"src/a.rs\"]".into()),
            files_edited_json: Some("[\"src/b.rs\"]".into()),
            commands_run_json: None,
            key_results_json: Some("[]".into()),
            text_summary: "Read src/a.rs, edited src/b.rs.".into(),
            created_at,
        }
    }

    #[test]
    fn insert_round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let s = seed(&conn);
        let summary = make_summary(&s, now_ms());
        insert(&conn, &summary).unwrap();
        let got = get_by_run(&conn, &s.run_id).unwrap().expect("summary");
        assert_eq!(got.text_summary, "Read src/a.rs, edited src/b.rs.");
        assert_eq!(got.files_read_json.as_deref(), Some("[\"src/a.rs\"]"));
        assert!(got.commands_run_json.is_none());
    }

    #[test]
    fn get_by_run_returns_none_when_absent() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let got = get_by_run(&conn, "no-such-run").unwrap();
        assert!(got.is_none());
    }

    #[test]
    fn list_for_chat_orders_by_created_at_then_summary_id() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let s = seed(&conn);
        // Two summaries at the same created_at — tiebreaker is summary_id ASC.
        let mut a = make_summary(&s, 1000);
        let mut b = make_summary(&s, 1000);
        // Force deterministic tiebreak by setting summary_id alphabetically.
        a.summary_id = "00000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa".into();
        b.summary_id = "00000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb".into();
        let c = make_summary(&s, 1001);

        // Insert out of order to prove ORDER BY does the work.
        insert(&conn, &b).unwrap();
        insert(&conn, &c).unwrap();
        insert(&conn, &a).unwrap();

        let got = list_for_chat(&conn, &s.chat_id).unwrap();
        assert_eq!(got.len(), 3);
        assert_eq!(got[0].summary_id, a.summary_id, "tiebreaker put a first");
        assert_eq!(got[1].summary_id, b.summary_id);
        assert_eq!(got[2].created_at, 1001);
    }

    #[test]
    fn list_for_chat_scoped_to_chat_id() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let s1 = seed(&conn);
        let s2 = seed(&conn);
        insert(&conn, &make_summary(&s1, now_ms())).unwrap();
        insert(&conn, &make_summary(&s2, now_ms())).unwrap();
        assert_eq!(list_for_chat(&conn, &s1.chat_id).unwrap().len(), 1);
        assert_eq!(list_for_chat(&conn, &s2.chat_id).unwrap().len(), 1);
    }
}
