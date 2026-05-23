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

    // Plan P0.2 — the workspace is in the `done` (frozen) UI state.
    // The carried string is the workspace_id so the frontend can route
    // a typed error back to a banner / toast on the right surface.
    // Closure-flow commands (`commit_workspace`, `push_workspace_branch`,
    // `create_workspace_pr`, `set_workspace_ui_status` for the reopen
    // path) deliberately do NOT return this variant.
    #[error("workspace is done and read-only: {0}")]
    Frozen(String),

    // Plan P2.6 — Merge-now flow step 1: the workspace has uncommitted
    // changes. The frontend maps `kind: "MergeDirtyTree"` to the toast
    // `"Commit your changes before merging."`. Carries the workspace
    // branch name for debug/log context.
    #[error("commit your changes before merging: {0}")]
    MergeDirtyTree(String),

    // Plan P2.6 — Merge-now flow step 3: the base branch is behind its
    // origin counterpart. The frontend maps `kind: "MergeBaseAhead"` to
    // the toast `"Pull <base name> first."` and renders a Pull button.
    // Carries the base branch name so the toast can name it.
    #[error("base ahead of origin/{0} — pull first")]
    MergeBaseAhead(String),

    // Plan P2.1.D — file_save's on-disk hash differs from the
    // `expected_hash` the editor handed back. Frontend dispatches on
    // `kind: "StaleFile"` and offers the user reload-or-discard.
    // Carries the workspace-relative path so the banner can name it.
    #[error("file changed on disk: {0}")]
    StaleFile(String),

    // Plan P0.1 S0.1.D — `validate_agent_path` rejected the canonical
    // path because it falls outside the sandbox level's allowed roots.
    // Distinct from `Validation` so the frontend can dispatch on
    // `kind: "PathRefused"` for a security-aware toast (rather than
    // the generic "invalid path"). The message string is formatted as
    // `<canonical> not in <level> sandbox` — single TEXT field for
    // wire-shape parity with the other AppError variants (the frontend
    // `unwrap` expects `error: { message: string }` across the board).
    #[error("path refused: {0}")]
    PathRefused(String),

    // ContextCompiler v1 (docs/agent-context-architecture.md, T3) —
    // fail-closed for essential context: current-message lookup,
    // cross-entity validation (`message.chat_id == chat_id`,
    // `chat.workspace_id == workspace_id`), history load. Surfaced to
    // the chat as a visible "context unavailable for this turn"
    // affordance instead of silently spawning a context-free agent.
    // Spoofed IDs land here too — so this variant carries a
    // diagnostic string suitable for logs, not for the user-facing
    // toast verbatim (the frontend renders its own fixed copy).
    #[error("context unavailable: {0}")]
    ContextLoad(String),
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
