# Plan: Step 1.3 — DB layer (db.rs + 001_init.sql + AppError)

**Spec source:** `docs/PLAN-v0.0.1.md` Step 1.3 (L414-416), Data Model (L174-279)
**Author:** /plan
**Date:** 2026-05-10
**Confidence:** 8/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/Cargo.toml:30` declares `rusqlite = { version = "0.31", features = ["bundled"] }` and `uuid = { version = "1", features = ["v4", "serde"] }` (added Step 1.2).
- `apps/desktop/src-tauri/src/lib.rs:1-4` has `#[cfg(test)] mod spikes;` only — no `mod db`, no `mod error` yet.
- `apps/desktop/src-tauri/migrations/` does not exist.
- `apps/desktop/src-tauri/src/spikes/spike_b_sqlite.rs:21-30` proved WAL + busy_timeout + foreign_keys pragma chain works on this machine.
- `docs/PLAN-v0.0.1.md:174-278` is the canonical schema source — copy SQL verbatim, do NOT paraphrase.

## 2. Intent — what we're delivering

A working SQLite layer at the Rust side: schema migrations apply on startup, all 9 tables exist, AppError type unifies error reporting, and CRUD primitives exist for the row shapes Steps 1.4-1.7 will consume. After Step 1.3:
- `tauri::State<DbState>` carries an `Arc<Mutex<Connection>>`
- a single `migrations/001_init.sql` is the source of truth for the schema
- `error::AppError` enum is the unified error returned by all DB ops (and later all Tauri commands)
- in-memory SQLite tests cover migration application, WAL pragma assertion, FK enforcement, and round-trip per table

## 3. Non-goals

- **No Tauri command registration in lib.rs.** Step 1.7 wires DB commands into the Builder. This step exposes only Rust-side functions.
- **No tauri-plugin-sql usage.** We keep it in Cargo (already added) but use rusqlite directly. Reason: all SQL stays in Rust (no JS-side queries planned per architecture); tauri-plugin-sql's JS conveniences are unused, and direct rusqlite gives us full pragma control.
- **No connection pooling library** (no r2d2-sqlite). Single `Mutex<Connection>` is sufficient for desktop low-concurrency use; can revisit if Step 1.7 surfaces contention.
- **No migration system v2** (multi-version). v0.0.1 only ships at schema_version=1. The runner is just "if schema_version row missing or =0, apply 001_init.sql". v0.0.2+ adds proper versioned migrations.
- **No window config fix here** (`.context/context.md` decision 5 deferred it to Step 1.3 — but it's tangential to DB work; defers to a tiny atom in Step 1.7 instead).

## 4. Architecture decisions locked in this plan

- **rusqlite direct + `Mutex<Connection>`**, not tauri-plugin-sql. Trade-off explained in §3.
- **`AppError` is a single enum** with variants for: Db, Io, GitCmd (placeholder for Step 1.6), Pty (placeholder for Step 1.5), Validation, NotFound. Implements `serde::Serialize` + `specta::Type` so Step 1.7 can return `Result<T, AppError>` from commands.
- **`AppError` impls `From<rusqlite::Error>`** so `?` propagates DB errors transparently.
- **Migrations live as embedded `&'static str`** via `include_str!("../migrations/001_init.sql")`. Reason: zero filesystem dependency at runtime, ships with the binary.
- **DB path strategy:** `tauri::path::BaseDirectory::AppLocalData` + `mozart.db`. In tests we use `:memory:`. Step 1.7 plumbs the resolved path into `init_db()`.
- **Schema structs in `db/models.rs`** with `#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]`. Naming mirrors SQL: `Repo`, `Task`, `Workspace`, `Thread`, `AgentRun`, `AgentEvent`, `WorkspaceChange`, `OutboxEvent`, `ConfigEntry`.
- **Timestamps as `i64` Unix milliseconds**, not `chrono::DateTime` (avoids a chrono dep and matches SQLite INTEGER storage exactly).
- **All IDs are `String` UUID v4** (matches schema TEXT PRIMARY KEY). Helper `new_id() -> String` lives in `db/mod.rs`.
- **CRUD scope**: only the functions Steps 1.4-1.7 will call. Listed in §5 below. NO speculative "list all events for all runs" until a caller needs it.

## 5. Files

### To create
- `apps/desktop/src-tauri/migrations/001_init.sql` — verbatim copy of PLAN-v0.0.1.md L184-278.
- `apps/desktop/src-tauri/src/error.rs` — `AppError` enum + `From<...>` impls.
- `apps/desktop/src-tauri/src/db/mod.rs` — `DbState`, `init_db()`, `apply_migrations()`, `new_id()`.
- `apps/desktop/src-tauri/src/db/models.rs` — 9 row structs.
- `apps/desktop/src-tauri/src/db/repos.rs` — `create`, `get_by_path`, `list`.
- `apps/desktop/src-tauri/src/db/tasks.rs` — `create`, `get`.
- `apps/desktop/src-tauri/src/db/workspaces.rs` — `create`, `get`, `list_by_task`, `list_all`, `update_status`, `update_branch_name`, `set_deletion_intent`.
- `apps/desktop/src-tauri/src/db/threads.rs` — `create`, `get_by_workspace`.
- `apps/desktop/src-tauri/src/db/agent_runs.rs` — `create`, `update_status`, `mark_ended`, `get`, `list_by_thread`.
- `apps/desktop/src-tauri/src/db/agent_events.rs` — `insert`, `list_by_run`.
- `apps/desktop/src-tauri/src/db/workspace_changes.rs` — `insert`, `latest_for_workspace`.
- `apps/desktop/src-tauri/src/db/outbox.rs` — `enqueue`, `drain_pending`, `mark_attempt`.
- `apps/desktop/src-tauri/src/db/config.rs` — `get`, `set`.

### To modify
- `apps/desktop/src-tauri/src/lib.rs` — add `pub mod error;` + `pub mod db;` (no Builder wiring yet).

### Reference (read-only)
- `apps/desktop/src-tauri/src/spikes/spike_b_sqlite.rs` — exact pragma chain to reuse.
- `docs/PLAN-v0.0.1.md:174-278` — schema canonical text.

## 6. Pseudocode (key units)

### `error.rs`
```rust
#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("database: {0}")]
    Db(String),
    #[error("io: {0}")]
    Io(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("validation: {0}")]
    Validation(String),
    // GitCmd / Pty added by later Steps
}

impl From<rusqlite::Error> for AppError { fn from(e) -> Self { AppError::Db(e.to_string()) } }
impl From<std::io::Error>  for AppError { fn from(e) -> Self { AppError::Io(e.to_string()) } }
```
Note: pulls `thiserror` into deps (not currently present — atom adds it).

### `db/mod.rs`
```rust
pub struct DbState(pub Arc<Mutex<Connection>>);

pub fn init_db(path: &Path) -> Result<DbState, AppError> {
    let conn = Connection::open(path)?;
    apply_pragmas(&conn)?;
    apply_migrations(&conn)?;
    Ok(DbState(Arc::new(Mutex::new(conn))))
}

fn apply_pragmas(conn: &Connection) -> Result<(), AppError> {
    conn.pragma_update(None, "journal_mode",  "WAL")?;
    conn.pragma_update(None, "synchronous",   "NORMAL")?;
    conn.pragma_update(None, "busy_timeout",  5000_i64)?;
    conn.pragma_update(None, "foreign_keys",  "ON")?;
    Ok(())
}

fn apply_migrations(conn: &Connection) -> Result<(), AppError> {
    // Check if schema_version table exists; if version=1 already, skip; else run 001.
    const INIT_SQL: &str = include_str!("../../migrations/001_init.sql");
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_version'",
        [], |r| r.get(0))?;
    if exists == 0 {
        conn.execute_batch(INIT_SQL)?;
    }
    Ok(())
}

pub fn new_id() -> String { uuid::Uuid::new_v4().to_string() }
```

### `db/workspaces.rs` — illustrative shape
```rust
pub fn create(conn: &Connection, ws: &Workspace) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspaces(workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![ws.workspace_id, ws.task_id, ws.worktree_path, ws.branch_name, ws.base_branch, ws.status, ws.created_at, ws.deletion_intent],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, workspace_id: &str) -> Result<Workspace, AppError> {
    conn.query_row(
        "SELECT workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent
         FROM workspaces WHERE workspace_id = ?1",
        [workspace_id],
        |row| /* map row -> Workspace */
    ).map_err(...)
}
// list_by_task, list_all, update_status, update_branch_name, set_deletion_intent similar shape
```

## 7. Error handling strategy

- All DB ops return `Result<T, AppError>`.
- `rusqlite::Error::QueryReturnedNoRows` → `AppError::NotFound(table)` in `get_*` functions (not raw Db).
- Migration failure is fatal at startup: `init_db()` propagates the error to the caller, which panics in Tauri's `setup` (Step 1.7 will surface this as a startup error dialog).
- FK violations during runtime are propagated as `AppError::Db(...)` — caller decides UX.

## 8. Task list (will be atomized into TASKS.md)

Execution order, single-core:

1. `migrations/001_init.sql` — verbatim from PLAN.
2. `error.rs` — AppError enum (incl. `thiserror` dep add).
3. `db/mod.rs` — DbState, init_db, apply_pragmas, apply_migrations, new_id + tests for migration application + pragma assertions.
4. `db/models.rs` — 9 row structs.
5. `db/repos.rs` + `db/tasks.rs` + `db/config.rs` (small simple ones first).
6. `db/threads.rs` + `db/workspaces.rs` (workspace is the busiest CRUD, with tests).
7. `db/agent_runs.rs` + `db/agent_events.rs` (the high-volume pair).
8. `db/workspace_changes.rs` + `db/outbox.rs`.
9. `lib.rs` glue — `pub mod error; pub mod db;` (single-line addition).

Atoms 5-8 each get their own integration test that round-trips a record through SQLite (in-memory).

## 9. Validation gate

After each atom:
```sh
cd apps/desktop/src-tauri && cargo check --tests
```

After the LAST atom (whole plan):
```sh
cd apps/desktop/src-tauri
cargo check                          # prod build clean
cargo test --tests                    # all unit tests pass (NO --ignored — DB tests don't need external state)
cargo clippy -- -D warnings           # lint clean
```

## 10. Rollback

Each atom is independent except 3 (mod.rs) and 9 (lib.rs glue). To roll back the whole plan: `git revert <commits>` in reverse order.

## 11. Open questions

(none)

## 12. Confidence

**8/10** — Schema is verbatim (zero invention risk). rusqlite + Mutex pattern is standard. The 25-ish CRUD functions are mechanical. Risk: we add `thiserror` mid-plan (already conceptually expected); some rusqlite-to-AppError mapping needs care for NotFound. The migration runner's "if schema_version table doesn't exist, run 001" is simplistic but correct for v0.0.1 single-version state.
