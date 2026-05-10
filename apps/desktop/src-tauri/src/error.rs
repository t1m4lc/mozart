//! Unified error type for all backend operations.
//!
//! `AppError` is `serde::Serialize + specta::Type` so it can be returned
//! from `#[tauri::command]` functions and surface to the Angular layer
//! as a typed `Result<T, AppError>` (see Step 1.7 + tauri-specta wiring).

use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("database error: {0}")]
    Db(String),

    #[error("io error: {0}")]
    Io(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("validation error: {0}")]
    Validation(String),

    // Future: GitCmd (Step 1.6), Pty (Step 1.5), AgentSpawn (Step 1.4)
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Db(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}
