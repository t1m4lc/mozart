//! Key-value config table — UPSERT on key.

use rusqlite::{params, Connection};

use crate::error::AppError;

pub fn get(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let result: Result<Option<String>, _> = conn.query_row(
        "SELECT value FROM config WHERE key = ?1",
        [key],
        |row| row.get(0),
    );
    match result {
        Ok(value) => Ok(value),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn set(conn: &Connection, key: &str, value: Option<&str>) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO config(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db_memory;

    #[test]
    fn get_missing_returns_none() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        assert_eq!(get(&conn, "no-such-key").unwrap(), None);
    }

    #[test]
    fn set_then_get() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        set(&conn, "first_launch_done", Some("true")).unwrap();
        assert_eq!(get(&conn, "first_launch_done").unwrap(), Some("true".into()));
    }

    #[test]
    fn upsert_overwrites() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        set(&conn, "k", Some("v1")).unwrap();
        set(&conn, "k", Some("v2")).unwrap();
        assert_eq!(get(&conn, "k").unwrap(), Some("v2".into()));
    }

    #[test]
    fn set_null_value() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        set(&conn, "k", None).unwrap();
        assert_eq!(get(&conn, "k").unwrap(), None);
    }
}
