//! CRUD for the `tasks` table.

use rusqlite::{params, Connection};

use crate::db::models::Task;
use crate::error::AppError;

pub fn create(conn: &Connection, task: &Task) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO tasks(task_id, repo_id, title, task_text, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![task.task_id, task.repo_id, task.title, task.task_text, task.status, task.created_at],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, task_id: &str) -> Result<Task, AppError> {
    conn.query_row(
        "SELECT task_id, repo_id, title, task_text, status, created_at FROM tasks WHERE task_id = ?1",
        [task_id],
        |row| Ok(Task {
            task_id: row.get(0)?,
            repo_id: row.get(1)?,
            title: row.get(2)?,
            task_text: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
        }),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("task id={task_id}")),
        other => other.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, new_id, now_ms, repos};
    use crate::db::models::Repo;

    fn seed_repo(conn: &Connection) -> String {
        let r = Repo {
            repo_id: new_id(),
            path: format!("/tmp/repo-{}", new_id()),
            display_name: "r".into(),
            added_at: now_ms(),
        };
        repos::create(conn, &r).unwrap();
        r.repo_id
    }

    #[test]
    fn round_trip() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let repo_id = seed_repo(&conn);
        let t = Task {
            task_id: new_id(),
            repo_id: repo_id.clone(),
            title: "Add feature X".into(),
            task_text: "implement feature X end-to-end".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        create(&conn, &t).unwrap();
        let got = get(&conn, &t.task_id).unwrap();
        assert_eq!(got.title, "Add feature X");
        assert_eq!(got.status, "active");
        assert_eq!(got.repo_id, repo_id);
    }

    #[test]
    fn fk_violation_rejected() {
        let db = init_db_memory().unwrap();
        let conn = db.lock();
        let t = Task {
            task_id: new_id(),
            repo_id: "no-such-repo".into(),
            title: "x".into(),
            task_text: "x".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        let err = create(&conn, &t).unwrap_err();
        assert!(matches!(err, AppError::Db(_)));
    }
}
