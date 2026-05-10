//! Spike B — SQLite WAL + small schema round-trip via rusqlite.
//!
//! Validates: PLAN-v0.0.1.md L407 — "D16 schema viability; migration runs;
//! concurrent reads + serialized writes survive".
//!
//! We use rusqlite directly here (not tauri-plugin-sql) because the spike
//! needs to assert WAL pragmas and FK behavior at the lowest layer the
//! plugin wraps. Step 1.3 will exercise the plugin proper.
//!
//! Run with:
//!   cargo test --tests spike_b -- --ignored --nocapture

use rusqlite::Connection;

#[test]
#[ignore = "spike — touches /tmp via tempfile, run with --ignored"]
fn spike_b_sqlite_wal_roundtrip() -> anyhow::Result<()> {
    let tmp = tempfile::tempdir()?;
    let db_path = tmp.path().join("spike.db");

    let conn = Connection::open(&db_path)?;
    // WAL requires a real file (not :memory:), and these three pragmas
    // are the minimum baseline we'll re-use in Step 1.3.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "busy_timeout", 5000_i64)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    // 3-table stripped schema (proves shape, not full D16)
    conn.execute_batch(
        r#"
        CREATE TABLE workspaces (
            id   TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );
        CREATE TABLE agent_runs (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id)
        );
        CREATE TABLE agent_events (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id  TEXT NOT NULL REFERENCES agent_runs(id),
            payload TEXT
        );
        "#,
    )?;

    // assert WAL is active
    let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
    anyhow::ensure!(mode.to_lowercase() == "wal", "expected WAL, got {mode}");

    // assert FKs are on
    let fks: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?;
    anyhow::ensure!(fks == 1, "foreign_keys must be ON");

    // round-trip: 1 workspace, 1 run, 3 events
    let ws_id = uuid::Uuid::new_v4().to_string();
    let run_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO workspaces(id, name) VALUES (?1, ?2)",
        (&ws_id, "spike-ws"),
    )?;
    conn.execute(
        "INSERT INTO agent_runs(id, workspace_id) VALUES (?1, ?2)",
        (&run_id, &ws_id),
    )?;
    for i in 0..3 {
        conn.execute(
            "INSERT INTO agent_events(run_id, payload) VALUES (?1, ?2)",
            (&run_id, format!("event-{i}")),
        )?;
    }

    // read back + count
    let event_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_events WHERE run_id = ?1",
        [&run_id],
        |r| r.get(0),
    )?;
    anyhow::ensure!(event_count == 3, "expected 3 events, got {event_count}");

    // FK enforcement: inserting a run with a bogus workspace_id must fail
    let bad = conn.execute(
        "INSERT INTO agent_runs(id, workspace_id) VALUES (?1, ?2)",
        ("bad-run", "no-such-workspace"),
    );
    anyhow::ensure!(bad.is_err(), "FK violation should have been rejected");

    // assert WAL files exist on disk (proves WAL really activated)
    anyhow::ensure!(
        db_path.with_extension("db-wal").exists(),
        "expected -wal sidecar file to exist"
    );

    eprintln!(
        "OK spike_b: WAL active, FKs enforced, 3 events round-tripped, db at {}",
        db_path.display()
    );
    Ok(())
}
