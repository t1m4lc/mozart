//! SQLite layer — connection, pragmas, migrations, ID generator.
//!
//! Strategy: single rusqlite Connection wrapped in Mutex inside Arc.
//! Sufficient for desktop low-concurrency use; revisit if Step 1.7
//! surfaces contention.
//!
//! All DB ops return `Result<T, AppError>`. See `crate::error`.

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::error::AppError;

pub mod config;
pub mod models;
pub mod repos;
pub mod tasks;
pub mod threads;
pub mod workspaces;

/// Embedded migration SQL. Ships with the binary — no filesystem dep at runtime.
const INIT_SQL: &str = include_str!("../../migrations/001_init.sql");

/// Tauri State wrapper around the shared connection.
pub struct DbState(pub Arc<Mutex<Connection>>);

impl DbState {
    /// Acquire a lock on the underlying connection.
    /// Panics on poison — DB lock poisoning means an unrecoverable bug elsewhere.
    pub fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.0.lock().expect("db mutex poisoned")
    }
}

/// Open the database at `path`, apply pragmas, run pending migrations.
/// Use `:memory:` for tests.
pub fn init_db(path: &Path) -> Result<DbState, AppError> {
    let conn = Connection::open(path)?;
    apply_pragmas(&conn)?;
    apply_migrations(&conn)?;
    Ok(DbState(Arc::new(Mutex::new(conn))))
}

/// Same as `init_db` but for the in-memory ":memory:" path. Used in tests.
#[cfg(test)]
pub fn init_db_memory() -> Result<DbState, AppError> {
    let conn = Connection::open_in_memory()?;
    apply_pragmas(&conn)?;
    apply_migrations(&conn)?;
    Ok(DbState(Arc::new(Mutex::new(conn))))
}

/// Apply the pragma chain validated by Spike B (S1.2.5).
fn apply_pragmas(conn: &Connection) -> Result<(), AppError> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "busy_timeout", 5000_i64)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

/// v0.0.1 migration runner: if `schema_version` table doesn't exist, run 001.
/// v0.0.2+ will iterate over numbered files and track applied versions.
fn apply_migrations(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_version'",
        [],
        |r| r.get(0),
    )?;
    if exists == 0 {
        conn.execute_batch(INIT_SQL)?;
    }
    Ok(())
}

/// Generate a fresh UUID v4 string. Use for all `*_id TEXT PRIMARY KEY` columns.
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Current Unix time in milliseconds. Use for all `*_at INTEGER` columns.
pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count_tables(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn init_db_memory_succeeds() {
        let _db = init_db_memory().expect("init_db_memory should succeed");
    }

    #[test]
    fn init_creates_all_10_tables() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        // 10 = schema_version + 9 domain tables (excludes sqlite_sequence which AUTOINCREMENT auto-creates)
        let count = count_tables(&conn);
        // We assert >= 10 because AUTOINCREMENT creates sqlite_sequence as an 11th table.
        assert!(count >= 10, "expected at least 10 tables, got {count}");
        // And explicitly check each domain table by name
        for table in [
            "schema_version", "repos", "tasks", "workspaces", "threads",
            "agent_runs", "agent_events", "workspace_changes", "events_outbox", "config",
        ] {
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "table {table} not found");
        }
    }

    #[test]
    fn schema_version_is_one() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let v: i64 = conn
            .query_row("SELECT version FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn pragmas_are_applied() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        // :memory: doesn't actually use WAL (in-memory has no file), so journal_mode reverts
        // to "memory". Test the ones that ARE meaningful in-memory.
        let busy: i64 = conn.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
        assert_eq!(busy, 5000);
        let fks: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(fks, 1);
    }

    #[test]
    fn idempotent_init_via_file_path() {
        // Run init_db twice on the same file path — second call must skip migrations.
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("idem.db");
        let _db1 = init_db(&path).unwrap();
        // Drop db1 to release the connection lock before reopening
        drop(_db1);
        let _db2 = init_db(&path).unwrap();
    }

    #[test]
    fn new_id_is_unique_uuid() {
        let a = new_id();
        let b = new_id();
        assert_ne!(a, b);
        assert_eq!(a.len(), 36); // UUID canonical form
    }
}
