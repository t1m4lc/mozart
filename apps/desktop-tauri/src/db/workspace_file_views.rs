//! CRUD for the `workspace_file_views` table — per-workspace per-file
//! "Viewed" review state. Backs P2.2 Viewed state + diff toolbar
//! (see `docs/specs/plan-mozart-dogfood-readiness.md` § P2.2 and
//! `[[mozart-viewed-principle]]`).
//!
//! The Viewed state is a passive review aid. Rows are inserted only
//! by an explicit reviewer action; the UI never auto-marks a file
//! viewed on open. Schema lives in
//! `migrations/009_workspace_file_views.sql`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
pub struct WorkspaceFileView {
    pub workspace_id: String,
    pub path: String,
    pub viewed_at: i64,
    /// Truncated sha256 of the file's contents at the moment the user
    /// marked it viewed. Compare against the current on-disk hash to
    /// derive `viewed` vs `changed_since_viewed`.
    pub viewed_at_hash: String,
}

const COLS: &str = "workspace_id, path, viewed_at, viewed_at_hash";

/// Insert-or-replace a Viewed record by `(workspace_id, path)`. Bumps
/// `viewed_at` + `viewed_at_hash` on every call so the latest mark is
/// always the source of truth.
pub fn upsert(conn: &Connection, row: &WorkspaceFileView) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspace_file_views(workspace_id, path, viewed_at, viewed_at_hash) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(workspace_id, path) DO UPDATE SET \
            viewed_at = excluded.viewed_at, \
            viewed_at_hash = excluded.viewed_at_hash",
        params![row.workspace_id, row.path, row.viewed_at, row.viewed_at_hash],
    )?;
    Ok(())
}

/// Remove a single Viewed record. No-op when the row does not exist.
pub fn delete(conn: &Connection, workspace_id: &str, path: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM workspace_file_views WHERE workspace_id = ?1 AND path = ?2",
        params![workspace_id, path],
    )?;
    Ok(())
}

pub fn get_opt(
    conn: &Connection,
    workspace_id: &str,
    path: &str,
) -> Result<Option<WorkspaceFileView>, AppError> {
    let res = conn.query_row(
        &format!(
            "SELECT {COLS} FROM workspace_file_views WHERE workspace_id = ?1 AND path = ?2"
        ),
        params![workspace_id, path],
        row_to_view,
    );
    match res {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn list_for_workspace(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<WorkspaceFileView>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM workspace_file_views WHERE workspace_id = ?1"
    ))?;
    let rows = stmt
        .query_map([workspace_id], row_to_view)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn row_to_view(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceFileView> {
    Ok(WorkspaceFileView {
        workspace_id: row.get(0)?,
        path: row.get(1)?,
        viewed_at: row.get(2)?,
        viewed_at_hash: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{Repo, Task, Workspace};
    use crate::db::{init_db_memory, new_id, now_ms, repos, tasks, workspaces};

    fn seed_workspace(conn: &Connection) -> String {
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
            branch_name: "b".into(),
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
        ws.workspace_id
    }

    #[test]
    fn upsert_then_get() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        let row = WorkspaceFileView {
            workspace_id: ws.clone(),
            path: "src/foo.ts".into(),
            viewed_at: 100,
            viewed_at_hash: "abc123".into(),
        };
        upsert(&conn, &row).unwrap();
        let got = get_opt(&conn, &ws, "src/foo.ts").unwrap().unwrap();
        assert_eq!(got, row);
    }

    #[test]
    fn upsert_overwrites_existing() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        let r1 = WorkspaceFileView {
            workspace_id: ws.clone(),
            path: "a.ts".into(),
            viewed_at: 1,
            viewed_at_hash: "h1".into(),
        };
        upsert(&conn, &r1).unwrap();
        let r2 = WorkspaceFileView {
            viewed_at: 2,
            viewed_at_hash: "h2".into(),
            ..r1.clone()
        };
        upsert(&conn, &r2).unwrap();
        let got = get_opt(&conn, &ws, "a.ts").unwrap().unwrap();
        assert_eq!(got.viewed_at, 2);
        assert_eq!(got.viewed_at_hash, "h2");
    }

    #[test]
    fn delete_removes_row() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        upsert(
            &conn,
            &WorkspaceFileView {
                workspace_id: ws.clone(),
                path: "x".into(),
                viewed_at: 1,
                viewed_at_hash: "h".into(),
            },
        )
        .unwrap();
        delete(&conn, &ws, "x").unwrap();
        assert!(get_opt(&conn, &ws, "x").unwrap().is_none());
    }

    #[test]
    fn list_returns_only_workspace_rows() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws_a = seed_workspace(&conn);
        let ws_b = seed_workspace(&conn);
        upsert(
            &conn,
            &WorkspaceFileView {
                workspace_id: ws_a.clone(),
                path: "a.ts".into(),
                viewed_at: 1,
                viewed_at_hash: "h".into(),
            },
        )
        .unwrap();
        upsert(
            &conn,
            &WorkspaceFileView {
                workspace_id: ws_a.clone(),
                path: "b.ts".into(),
                viewed_at: 2,
                viewed_at_hash: "h".into(),
            },
        )
        .unwrap();
        upsert(
            &conn,
            &WorkspaceFileView {
                workspace_id: ws_b.clone(),
                path: "c.ts".into(),
                viewed_at: 3,
                viewed_at_hash: "h".into(),
            },
        )
        .unwrap();
        let rows = list_for_workspace(&conn, &ws_a).unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.workspace_id == ws_a));
    }

    #[test]
    fn fk_cascades_on_workspace_delete() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let ws = seed_workspace(&conn);
        upsert(
            &conn,
            &WorkspaceFileView {
                workspace_id: ws.clone(),
                path: "z".into(),
                viewed_at: 1,
                viewed_at_hash: "h".into(),
            },
        )
        .unwrap();
        conn.execute("DELETE FROM workspaces WHERE workspace_id = ?1", [&ws])
            .unwrap();
        assert!(get_opt(&conn, &ws, "z").unwrap().is_none());
    }
}
