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

pub mod agent_events;
pub mod agent_run_envelopes;
pub mod agent_runs;
pub mod agent_turn_summaries;
pub mod chats;
pub mod config;
pub mod messages;
pub mod models;
pub mod outbox;
pub mod project_local_config;
pub mod repos;
pub mod reset;
pub mod tasks;
pub mod threads;
pub mod workspace_active_chat;
pub mod workspace_changes;
pub mod workspace_file_views;
pub mod workspaces;

/// Embedded migration SQL. Each entry is `(target_version, sql)`. The
/// runner applies any whose `target_version > current_version`, in
/// ascending order. Ships with the binary — no filesystem dep at runtime.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/001_init.sql")),
    (2, include_str!("../../migrations/002_projects_user_state.sql")),
    (3, include_str!("../../migrations/003_workspaces_ui_status.sql")),
    (4, include_str!("../../migrations/004_chat.sql")),
    (5, include_str!("../../migrations/005_chat_phase2.sql")),
    (6, include_str!("../../migrations/006_repos_run_command.sql")),
    (7, include_str!("../../migrations/007_project_local_config.sql")),
    (8, include_str!("../../migrations/008_workspaces_last_merge_action.sql")),
    (9, include_str!("../../migrations/009_workspace_file_views.sql")),
    (10, include_str!("../../migrations/010_workspace_sandbox_level.sql")),
    (11, include_str!("../../migrations/011_agent_run_envelopes.sql")),
    (12, include_str!("../../migrations/012_agent_turn_summaries.sql")),
];

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

/// v0.1.0-beta.1 migration runner: if `schema_version` table doesn't exist, run 001.
/// v0.1.0+ will iterate over numbered files and track applied versions.
///
/// In v0.1.0-beta.1 the schema is still settling (Step 3 added `name`, `pinned`,
/// `unread` to `workspaces` after early dev DBs were already created).
/// We patch missing columns idempotently on every boot so existing dev
/// installs self-heal without a manual `rm ~/.mozart`. The patch is a
/// no-op once the columns exist.
fn apply_migrations(conn: &Connection) -> Result<(), AppError> {
    let bootstrapped: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_version'",
        [],
        |r| r.get(0),
    )?;
    let mut current: i64 = if bootstrapped == 0 {
        0
    } else {
        conn.query_row("SELECT version FROM schema_version", [], |r| r.get(0))?
    };
    for (target, sql) in MIGRATIONS {
        if *target > current {
            conn.execute_batch(sql)?;
            current = *target;
        }
    }
    patch_workspaces_columns(conn)?;
    patch_repos_user_state_columns(conn)?;
    patch_project_local_config_table(conn)?;
    Ok(())
}

/// Idempotently add v0.1.0-beta.1 columns to `workspaces` if a pre-existing
/// dev DB is missing them. Once v0.1.0-beta.1 ships, this lives forever as a
/// safety net for upgraders from any 0.0.1-* dev snapshot.
fn patch_workspaces_columns(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("PRAGMA table_info(workspaces)")?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    if !cols.iter().any(|c| c == "name") {
        conn.execute_batch(
            "ALTER TABLE workspaces ADD COLUMN name TEXT NOT NULL DEFAULT ''",
        )?;
    }
    if !cols.iter().any(|c| c == "pinned") {
        conn.execute_batch(
            "ALTER TABLE workspaces ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT false",
        )?;
    }
    if !cols.iter().any(|c| c == "unread") {
        conn.execute_batch(
            "ALTER TABLE workspaces ADD COLUMN unread BOOLEAN NOT NULL DEFAULT false",
        )?;
    }
    if !cols.iter().any(|c| c == "ui_status") {
        conn.execute_batch(
            "ALTER TABLE workspaces ADD COLUMN ui_status TEXT NOT NULL DEFAULT 'backlog'",
        )?;
    }
    if !cols.iter().any(|c| c == "last_merge_action") {
        conn.execute_batch("ALTER TABLE workspaces ADD COLUMN last_merge_action TEXT")?;
    }
    if !cols.iter().any(|c| c == "sandbox_level") {
        conn.execute_batch(
            "ALTER TABLE workspaces ADD COLUMN sandbox_level TEXT NOT NULL DEFAULT 'L2Project'",
        )?;
    }
    Ok(())
}

/// Belt-and-braces for v2 columns. Existing dev DBs that booted on v1
/// pick these up via the migration runner above; this guard catches
/// snapshots that recorded `version = 2` but skipped the column adds.
fn patch_repos_user_state_columns(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("PRAGMA table_info(repos)")?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    if !cols.iter().any(|c| c == "icon") {
        conn.execute_batch("ALTER TABLE repos ADD COLUMN icon TEXT")?;
    }
    if !cols.iter().any(|c| c == "hidden") {
        conn.execute_batch(
            "ALTER TABLE repos ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
        )?;
    }
    if !cols.iter().any(|c| c == "sort_index") {
        conn.execute_batch(
            "ALTER TABLE repos ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0",
        )?;
    }
    if !cols.iter().any(|c| c == "run_command") {
        conn.execute_batch("ALTER TABLE repos ADD COLUMN run_command TEXT")?;
    }
    Ok(())
}

/// Idempotently (re-)create `project_local_config` at v7. Dev DB snapshots
/// from pre-merge builds of P0.3.H landed with `schema_version = 7` set
/// but the CREATE TABLE never finalized — this guard heals those snapshots
/// on next boot. No-op when the table already exists.
fn patch_project_local_config_table(conn: &Connection) -> Result<(), AppError> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_local_config'",
        [],
        |r| r.get(0),
    )?;
    if n == 0 {
        conn.execute_batch(
            "CREATE TABLE project_local_config (\n\
                project_id   TEXT PRIMARY KEY,\n\
                run_json     TEXT NOT NULL,\n\
                merge_mode   TEXT NOT NULL DEFAULT 'pr',\n\
                created_at   INTEGER NOT NULL,\n\
                updated_at   INTEGER NOT NULL,\n\
                FOREIGN KEY (project_id) REFERENCES repos(repo_id) ON DELETE CASCADE\n\
            );",
        )?;
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
    fn schema_version_matches_latest_migration() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let v: i64 = conn
            .query_row("SELECT version FROM schema_version", [], |r| r.get(0))
            .unwrap();
        let latest = MIGRATIONS.last().expect("at least one migration").0;
        assert_eq!(v, latest);
    }

    #[test]
    fn repos_has_v2_user_state_columns() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let mut stmt = conn.prepare("PRAGMA table_info(repos)").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        for col in ["icon", "hidden", "sort_index"] {
            assert!(
                cols.iter().any(|c| c == col),
                "expected repos.{col} after v2 migration, got cols={cols:?}"
            );
        }
    }

    #[test]
    fn project_local_config_table_exists_after_v7() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_local_config'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1, "project_local_config should exist after v7 migration");
        let mut stmt = conn.prepare("PRAGMA table_info(project_local_config)").unwrap();
        let cols: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        for col in ["project_id", "run_json", "merge_mode", "created_at", "updated_at"] {
            assert!(
                cols.iter().any(|c| c == col),
                "expected project_local_config.{col} after v7, got cols={cols:?}"
            );
        }
    }

    fn table_columns(conn: &Connection, table: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap();
        stmt.query_map([], |r| r.get::<_, String>(1))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    }

    #[test]
    fn agent_run_envelopes_table_exists_after_v11() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='agent_run_envelopes'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        let cols = table_columns(&conn, "agent_run_envelopes");
        for col in [
            "run_id", "chat_id", "envelope_json", "rendered_text",
            "provider", "nonce", "char_count", "est_tokens", "created_at",
        ] {
            assert!(
                cols.iter().any(|c| c == col),
                "expected agent_run_envelopes.{col} after v11, got cols={cols:?}"
            );
        }
        let idx: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_agent_run_envelopes_chat_created'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1, "retention prune index missing");
    }

    #[test]
    fn agent_runs_prompt_source_default_after_v11() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let cols = table_columns(&conn, "agent_runs");
        assert!(
            cols.iter().any(|c| c == "prompt_source"),
            "agent_runs.prompt_source missing after v11, got cols={cols:?}"
        );
        // Verify the column default is the backfill value for existing rows.
        let default: Option<String> = conn
            .query_row(
                "SELECT dflt_value FROM pragma_table_info('agent_runs') WHERE name='prompt_source'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            default.as_deref(),
            Some("'frontend_collapsed'"),
            "prompt_source default should backfill existing rows"
        );
    }

    #[test]
    fn agent_turn_summaries_table_exists_after_v12() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='agent_turn_summaries'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        let cols = table_columns(&conn, "agent_turn_summaries");
        for col in [
            "summary_id", "run_id", "message_id", "chat_id",
            "files_read_json", "files_edited_json", "commands_run_json",
            "key_results_json", "text_summary", "created_at",
        ] {
            assert!(
                cols.iter().any(|c| c == col),
                "expected agent_turn_summaries.{col} after v12, got cols={cols:?}"
            );
        }
        let idx: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_agent_turn_summaries_chat'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1, "chat,created_at index missing");
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

    // T11: WAL must actually be active after a file-backed init. The
    // in-memory smoke test above can't verify WAL because in-memory
    // SQLite reports journal_mode="memory". This test opens a real file,
    // boots through `init_db` (the same path the desktop app takes), and
    // asserts the post-init PRAGMA reports "wal". Regression guard
    // against a silent failure inside `apply_pragmas` — without WAL the
    // ContextCompiler's `BEGIN DEFERRED` reads would race the supervisor
    // task's event writes.
    #[test]
    fn wal_journal_mode_active_after_file_backed_init() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("wal-startup.db");
        let db = init_db(&path).unwrap();
        let conn = db.lock();
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            mode.to_ascii_lowercase(),
            "wal",
            "init_db must leave journal_mode='wal' after apply_pragmas"
        );
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

#[cfg(test)]
mod heal_test {
    use super::*;

    #[test]
    fn patch_recreates_missing_project_local_config_at_v7() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("legacy.db");
        // Simulate the bad state: v7 set, but project_local_config table
        // does not exist. (Run migrations 1-6 manually, then bump version.)
        {
            let conn = Connection::open(&path).unwrap();
            apply_pragmas(&conn).unwrap();
            for (target, sql) in &MIGRATIONS[..6] {
                conn.execute_batch(sql).unwrap();
                assert!(*target <= 6);
            }
            conn.execute("UPDATE schema_version SET version = 7", []).unwrap();
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_local_config'",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 0, "table should be missing in the simulated bad state");
        }
        // init_db must heal: the patch creates the missing table.
        let _db = init_db(&path).expect("init_db heals legacy DB");
        let conn = Connection::open(&path).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_local_config'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1, "patch should re-create project_local_config");
    }
}
