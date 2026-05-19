//! CRUD for the `project_local_config` table — the user-machine-only
//! fallback for `.mozart/run.json` and the canonical home of
//! `merge_mode`. Repo-side equivalents live on disk in `.mozart/*` and
//! never appear in this table.
//!
//! Schema lives in `migrations/007_project_local_config.sql`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
pub struct ProjectLocalConfig {
    pub project_id: String,
    /// Serialized `RunConfig` JSON — round-tripped through the
    /// `mozart_config::dto::RunConfig` encoder so key order matches the
    /// shape `.mozart/run.json` would carry on disk.
    pub run_json: String,
    pub merge_mode: String,
    pub created_at: i64,
    pub updated_at: i64,
}

const COLS: &str = "project_id, run_json, merge_mode, created_at, updated_at";

/// Insert-or-replace by primary key. Used during bootstrap when the
/// project is detected as no-`.mozart/` (silent local default).
pub fn upsert(conn: &Connection, row: &ProjectLocalConfig) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO project_local_config(project_id, run_json, merge_mode, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(project_id) DO UPDATE SET \
            run_json = excluded.run_json, \
            merge_mode = excluded.merge_mode, \
            updated_at = excluded.updated_at",
        params![
            row.project_id,
            row.run_json,
            row.merge_mode,
            row.created_at,
            row.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, project_id: &str) -> Result<ProjectLocalConfig, AppError> {
    conn.query_row(
        &format!("SELECT {COLS} FROM project_local_config WHERE project_id = ?1"),
        [project_id],
        row_to_config,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("project_local_config project_id={project_id}"))
        }
        other => other.into(),
    })
}

pub fn get_opt(
    conn: &Connection,
    project_id: &str,
) -> Result<Option<ProjectLocalConfig>, AppError> {
    match get(conn, project_id) {
        Ok(row) => Ok(Some(row)),
        Err(AppError::NotFound(_)) => Ok(None),
        Err(e) => Err(e),
    }
}

fn row_to_config(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectLocalConfig> {
    Ok(ProjectLocalConfig {
        project_id: row.get(0)?,
        run_json: row.get(1)?,
        merge_mode: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::Repo;
    use crate::db::{init_db_memory, new_id, now_ms, repos};

    fn seed_repo(conn: &Connection) -> String {
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
        r.repo_id
    }

    #[test]
    fn upsert_then_get() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let project_id = seed_repo(&conn);
        let row = ProjectLocalConfig {
            project_id: project_id.clone(),
            run_json: r#"{"scripts":{"setup":"pnpm install"}}"#.into(),
            merge_mode: "pr".into(),
            created_at: 1,
            updated_at: 1,
        };
        upsert(&conn, &row).unwrap();
        let got = get(&conn, &project_id).unwrap();
        assert_eq!(got, row);
    }

    #[test]
    fn upsert_replaces_existing() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let project_id = seed_repo(&conn);
        let r1 = ProjectLocalConfig {
            project_id: project_id.clone(),
            run_json: "{}".into(),
            merge_mode: "pr".into(),
            created_at: 1,
            updated_at: 1,
        };
        upsert(&conn, &r1).unwrap();
        let r2 = ProjectLocalConfig {
            run_json: r#"{"scripts":{"run":"go run ."}}"#.into(),
            merge_mode: "local".into(),
            updated_at: 2,
            ..r1.clone()
        };
        upsert(&conn, &r2).unwrap();
        let got = get(&conn, &project_id).unwrap();
        assert_eq!(got.run_json, r2.run_json);
        assert_eq!(got.merge_mode, "local");
        assert_eq!(got.updated_at, 2);
        assert_eq!(got.created_at, 1, "created_at preserved on update");
    }

    #[test]
    fn get_opt_returns_none_for_missing() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        assert!(get_opt(&conn, "missing-id").unwrap().is_none());
    }

    #[test]
    fn fk_cascades_when_repo_deleted() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        let project_id = seed_repo(&conn);
        let row = ProjectLocalConfig {
            project_id: project_id.clone(),
            run_json: "{}".into(),
            merge_mode: "pr".into(),
            created_at: 1,
            updated_at: 1,
        };
        upsert(&conn, &row).unwrap();
        drop(conn);
        let mut conn = db.lock();
        repos::delete(&mut conn, &project_id).unwrap();
        drop(conn);
        let conn = db.lock();
        assert!(get_opt(&conn, &project_id).unwrap().is_none());
    }
}
