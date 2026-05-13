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

    #[error("agent spawn failed: {0}")]
    AgentSpawn(String),

    #[error("git command failed: {0}")]
    GitCmd(String),
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

impl From<keyring::Error> for AppError {
    // Step 6 — Anthropic key storage. We deliberately do NOT call
    // `err.to_string()` here: the `BadEncoding(Vec<u8>)` variant carries
    // the raw bytes of an unreadable credential, and downstream Display
    // impls (now or in future keyring releases) could embed those bytes in
    // the formatted string. Mapping by variant to a fixed message keeps
    // the API key out of every code path that ever sees an `AppError`.
    fn from(err: keyring::Error) -> Self {
        use keyring::Error as K;
        let msg = match err {
            K::PlatformFailure(_) => "keyring platform failure",
            K::NoStorageAccess(_) => "no keyring backend available",
            K::NoEntry => "no keyring entry",
            K::BadEncoding(_) => "keyring entry has bad encoding",
            K::TooLong(_, _) => "keyring entry exceeds platform limit",
            K::Invalid(_, _) => "invalid keyring entry parameters",
            K::Ambiguous(_) => "ambiguous keyring entry",
            _ => "keyring error",
        };
        AppError::Io(msg.into())
    }
}
