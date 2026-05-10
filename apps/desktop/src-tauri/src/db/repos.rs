//! CRUD for the `repos` table.

use rusqlite::{params, Connection};

use crate::db::models::Repo;
use crate::error::AppError;

pub fn create(conn: &Connection, repo: &Repo) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO repos(repo_id, path, display_name, added_at) VALUES (?1, ?2, ?3, ?4)",
        params![repo.repo_id, repo.path, repo.display_name, repo.added_at],
    )?;
    Ok(())
}

pub fn get_by_path(conn: &Connection, path: &str) -> Result<Repo, AppError> {
    conn.query_row(
        "SELECT repo_id, path, display_name, added_at FROM repos WHERE path = ?1",
        [path],
        row_to_repo,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("repo path={path}")),
        other => other.into(),
    })
}

pub fn list(conn: &Connection) -> Result<Vec<Repo>, AppError> {
    let mut stmt = conn.prepare("SELECT repo_id, path, display_name, added_at FROM repos ORDER BY added_at DESC")?;
    let rows = stmt.query_map([], row_to_repo)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn row_to_repo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Repo> {
    Ok(Repo {
        repo_id: row.get(0)?,
        path: row.get(1)?,
        display_name: row.get(2)?,
        added_at: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms};

    fn sample(path: &str) -> Repo {
        Repo {
            repo_id: new_id(),
            path: path.to_string(),
            display_name: "test repo".to_string(),
            added_at: now_ms(),
        }
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let r = sample("/tmp/test-repo");
        create(&conn, &r).unwrap();
        let got = get_by_path(&conn, "/tmp/test-repo").unwrap();
        assert_eq!(got.repo_id, r.repo_id);
        assert_eq!(got.display_name, "test repo");
    }

    #[test]
    fn not_found_returns_app_error() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let err = get_by_path(&conn, "/nope").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn list_orders_by_added_at_desc() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let mut a = sample("/a");
        a.added_at = 1;
        let mut b = sample("/b");
        b.added_at = 2;
        create(&conn, &a).unwrap();
        create(&conn, &b).unwrap();
        let got = list(&conn).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].path, "/b"); // newer first
    }
}
