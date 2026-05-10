//! CRUD for the `events_outbox` table — telemetry queue (drained by Step M12).

use rusqlite::{params, Connection};

use crate::db::models::OutboxEvent;
use crate::error::AppError;

const MAX_ATTEMPTS: i64 = 5;

/// Enqueue a new event for delivery. Returns the auto-incremented outbox_id.
pub fn enqueue(conn: &Connection, event_name: &str, props_json: &str, enqueued_at: i64) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO events_outbox(event_name, props_json, enqueued_at) VALUES (?1, ?2, ?3)",
        params![event_name, props_json, enqueued_at],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Return rows where attempts < MAX_ATTEMPTS, oldest first. Used by the drain task.
pub fn drain_pending(conn: &Connection, limit: i64) -> Result<Vec<OutboxEvent>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT outbox_id, event_name, props_json, enqueued_at, attempts, last_attempt
         FROM events_outbox
         WHERE attempts < ?1
         ORDER BY enqueued_at ASC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![MAX_ATTEMPTS, limit], |row| {
        Ok(OutboxEvent {
            outbox_id: row.get(0)?,
            event_name: row.get(1)?,
            props_json: row.get(2)?,
            enqueued_at: row.get(3)?,
            attempts: row.get(4)?,
            last_attempt: row.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

/// Increment attempts + record last_attempt timestamp. Called after each delivery try.
pub fn mark_attempt(conn: &Connection, outbox_id: i64, last_attempt: i64) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE events_outbox SET attempts = attempts + 1, last_attempt = ?1 WHERE outbox_id = ?2",
        params![last_attempt, outbox_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("outbox id={outbox_id}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, now_ms};

    #[test]
    fn enqueue_and_drain_in_order() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        enqueue(&conn, "app_launched", r#"{"v":"0.0.1"}"#, 100).unwrap();
        enqueue(&conn, "workspace_created", "{}", 200).unwrap();
        enqueue(&conn, "agent_run_started", "{}", 150).unwrap();
        let pending = drain_pending(&conn, 10).unwrap();
        assert_eq!(pending.len(), 3);
        assert_eq!(pending[0].enqueued_at, 100);
        assert_eq!(pending[1].enqueued_at, 150);
        assert_eq!(pending[2].enqueued_at, 200);
    }

    #[test]
    fn mark_attempt_increments_and_caps() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let id = enqueue(&conn, "x", "{}", now_ms()).unwrap();
        for _ in 0..MAX_ATTEMPTS {
            mark_attempt(&conn, id, now_ms()).unwrap();
        }
        // After MAX_ATTEMPTS, drain_pending must NOT return this row anymore.
        let pending = drain_pending(&conn, 10).unwrap();
        assert!(pending.iter().all(|e| e.outbox_id != id));
    }

    #[test]
    fn drain_respects_limit() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        for i in 0..20 {
            enqueue(&conn, "x", "{}", i).unwrap();
        }
        let pending = drain_pending(&conn, 5).unwrap();
        assert_eq!(pending.len(), 5);
    }
}
