//! CRUD for `agent_run_envelopes`.
//!
//! Stores the structured `LLMEnvelope` (`envelope_json`) and the
//! rendered bytes (`rendered_text`) that the provider transport piped
//! to the LLM for each agent run. Used for traceability, debugging,
//! and a future "what did we actually send?" inspector.
//!
//! Retention (D2 safety net): unbounded growth would balloon the
//! SQLite file for heavy users who never archive workspaces. The
//! `insert_with_retention` function inserts the new row and prunes
//! the chat back down to the latest `retention_n` envelopes in the
//! same transaction. The `idx_agent_run_envelopes_chat_created`
//! index covers both the insert path's prune subquery and the future
//! debug-inspector's `latest_for_chat` query.

use rusqlite::{params, Connection};

use crate::db::models::AgentRunEnvelope;
use crate::error::AppError;

/// Default retention bound for production callers. Users who never
/// archive will still see envelope rows capped per chat. Tests pass
/// smaller values to exercise the prune path without seeding 50+ rows.
pub const ENVELOPE_RETENTION_PER_CHAT: i64 = 50;

const COLS: &str =
    "run_id, chat_id, envelope_json, rendered_text, provider, nonce, \
     char_count, est_tokens, created_at";

/// Insert one envelope row and prune any rows older than the
/// `retention_n` newest for the same chat. Returns the number of
/// pruned rows (informational; production callers ignore).
///
/// The prune subquery orders by `created_at DESC` so the row we just
/// inserted is always in the keep-set and is never the row that gets
/// deleted.
pub fn insert_with_retention(
    conn: &mut Connection,
    env: &AgentRunEnvelope,
    retention_n: i64,
) -> Result<usize, AppError> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO agent_run_envelopes(run_id, chat_id, envelope_json, rendered_text, \
         provider, nonce, char_count, est_tokens, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            env.run_id, env.chat_id, env.envelope_json, env.rendered_text,
            env.provider, env.nonce, env.char_count, env.est_tokens, env.created_at,
        ],
    )?;
    let pruned = tx.execute(
        "DELETE FROM agent_run_envelopes \
         WHERE chat_id = ?1 \
           AND run_id NOT IN ( \
             SELECT run_id FROM agent_run_envelopes \
             WHERE chat_id = ?1 \
             ORDER BY created_at DESC \
             LIMIT ?2 \
           )",
        params![env.chat_id, retention_n],
    )?;
    tx.commit()?;
    Ok(pruned)
}

/// Debug/audit lookup. Returns `NotFound` if no envelope was written
/// for this `run_id` (which is normal for legacy runs that ran before
/// migration 011, or runs that errored before the post-spawn writer
/// fired).
pub fn get_by_run(conn: &Connection, run_id: &str) -> Result<AgentRunEnvelope, AppError> {
    conn.query_row(
        &format!("SELECT {COLS} FROM agent_run_envelopes WHERE run_id = ?1"),
        [run_id],
        row_to_envelope,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("agent_run_envelope run_id={run_id}"))
        }
        other => other.into(),
    })
}

fn row_to_envelope(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentRunEnvelope> {
    Ok(AgentRunEnvelope {
        run_id: row.get(0)?,
        chat_id: row.get(1)?,
        envelope_json: row.get(2)?,
        rendered_text: row.get(3)?,
        provider: row.get(4)?,
        nonce: row.get(5)?,
        char_count: row.get(6)?,
        est_tokens: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{AgentRun, Chat, Repo, Task, Thread, Workspace};
    use crate::db::{
        agent_runs, chats, init_db_memory, new_id, now_ms, repos, tasks, threads,
        workspaces,
    };

    /// Seed `repo -> task -> workspace -> thread -> chat` and return the
    /// chat_id and thread_id. Each agent_run created on top of this
    /// seed lives in the same chat so retention tests can run cheaply.
    fn seed_chat(conn: &Connection) -> (String, String) {
        let r = Repo {
            repo_id: new_id(),
            path: format!("/r-{}", new_id()),
            display_name: "r".into(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
            run_command: None,
            setup_command: None,
        };
        repos::create(conn, &r).unwrap();
        let t = Task {
            task_id: new_id(),
            repo_id: r.repo_id.clone(),
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
        (chat.chat_id, th.thread_id)
    }

    fn make_run(thread_id: &str) -> AgentRun {
        AgentRun {
            run_id: new_id(),
            thread_id: thread_id.into(),
            prompt: "p".into(),
            status: "done".into(),
            started_at: now_ms(),
            ended_at: Some(now_ms()),
            exit_code: Some(0),
            error_message: None,
            checkpoint_sha: None,
            prompt_source: "message_content".into(),
        }
    }

    fn make_envelope(run_id: &str, chat_id: &str, created_at: i64) -> AgentRunEnvelope {
        AgentRunEnvelope {
            run_id: run_id.into(),
            chat_id: chat_id.into(),
            envelope_json: "{}".into(),
            rendered_text: "rendered".into(),
            provider: "claude_cli".into(),
            nonce: "deadbeef".into(),
            char_count: 100,
            est_tokens: 28,
            created_at,
        }
    }

    fn count_envelopes_for_chat(conn: &Connection, chat_id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM agent_run_envelopes WHERE chat_id = ?1",
            [chat_id],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn insert_round_trip() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let (chat_id, thread_id) = seed_chat(&conn);
        let run = make_run(&thread_id);
        agent_runs::create(&conn, &run).unwrap();
        let env = make_envelope(&run.run_id, &chat_id, now_ms());
        let pruned = insert_with_retention(&mut conn, &env, 50).unwrap();
        assert_eq!(pruned, 0);
        let got = get_by_run(&conn, &run.run_id).unwrap();
        assert_eq!(got.chat_id, chat_id);
        assert_eq!(got.provider, "claude_cli");
        assert_eq!(got.char_count, 100);
    }

    #[test]
    fn retention_prunes_oldest_beyond_n() {
        // retention_n = 3 so seeding 5 rows leaves the 3 newest and
        // deletes the 2 oldest in a single transaction.
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let (chat_id, thread_id) = seed_chat(&conn);

        // Seed 5 runs + envelopes with monotonically increasing created_at.
        for i in 0..5i64 {
            let run = make_run(&thread_id);
            agent_runs::create(&conn, &run).unwrap();
            let env = make_envelope(&run.run_id, &chat_id, 1000 + i);
            let pruned = insert_with_retention(&mut conn, &env, 3).unwrap();
            // First 3 inserts prune nothing; insert #4 prunes the 1st;
            // insert #5 prunes the 2nd (now-oldest in keep-set).
            if i < 3 {
                assert_eq!(pruned, 0, "insert {i} pruned unexpectedly");
            } else {
                assert_eq!(pruned, 1, "insert {i} expected to prune exactly 1");
            }
        }
        assert_eq!(count_envelopes_for_chat(&conn, &chat_id), 3);

        // The surviving rows must be the 3 newest by created_at.
        let mut survivors: Vec<i64> = conn
            .prepare(
                "SELECT created_at FROM agent_run_envelopes \
                 WHERE chat_id = ?1 ORDER BY created_at ASC",
            )
            .unwrap()
            .query_map([&chat_id], |r| r.get::<_, i64>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        survivors.sort();
        assert_eq!(survivors, vec![1002, 1003, 1004]);
    }

    #[test]
    fn retention_scoped_to_chat() {
        // Two chats share the same connection. Inserts into chat A
        // must not prune chat B's envelopes.
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let (chat_a, thread_a) = seed_chat(&conn);
        let (chat_b, thread_b) = seed_chat(&conn);

        // Fill chat A past the retention bound.
        for i in 0..4i64 {
            let run = make_run(&thread_a);
            agent_runs::create(&conn, &run).unwrap();
            let env = make_envelope(&run.run_id, &chat_a, 1000 + i);
            insert_with_retention(&mut conn, &env, 2).unwrap();
        }
        // Add 1 envelope to chat B with an OLD created_at (would be
        // pruned if scoping were broken).
        let run_b = make_run(&thread_b);
        agent_runs::create(&conn, &run_b).unwrap();
        let env_b = make_envelope(&run_b.run_id, &chat_b, 500);
        insert_with_retention(&mut conn, &env_b, 2).unwrap();

        assert_eq!(count_envelopes_for_chat(&conn, &chat_a), 2);
        assert_eq!(count_envelopes_for_chat(&conn, &chat_b), 1);
        // The very-old chat B row survives.
        assert!(get_by_run(&conn, &run_b.run_id).is_ok());
    }

    #[test]
    fn get_by_run_not_found() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = get_by_run(&conn, "no-such-run").unwrap_err();
        match err {
            AppError::NotFound(_) => {}
            other => panic!("expected NotFound, got {other:?}"),
        }
    }
}
