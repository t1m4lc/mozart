//! Tauri command surface for Mozart's desktop app. Each command is
//! `#[tauri::command] #[specta::specta]` so `bindings_export.rs` can
//! collect them into a typed TS surface. v0.0.1 = 12 commands per the
//! atomized plan (S1.7.1b — stubs; S1.7.3 — bodies).
//!
//! Field-naming contract (plan §4, D17 vocabulary): argument identifiers
//! use canonical concepts only (`workspace_id`, `task_id`, `run_id`,
//! `repo_id`, `prompt`, `path`). No `worktree_path` / `branch_name` /
//! `agent/wip-…` may appear as command arguments.

use tauri::ipc::Channel;
use tauri::State;

use crate::claude_cli::install::ClaudeInstall;
use crate::claude_cli::StreamEvent;
use crate::db::models::{AgentRun, Repo, Workspace, WorkspaceChange};
use crate::db::DbState;
use crate::error::AppError;
use crate::run_registry::RunRegistry;

#[tauri::command]
#[specta::specta]
pub async fn list_repos(_db: State<'_, DbState>) -> Result<Vec<Repo>, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn add_repo(
    _db: State<'_, DbState>,
    _path: String,
) -> Result<Repo, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn list_branches(_repo_path: String) -> Result<Vec<String>, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn create_workspace(
    _db: State<'_, DbState>,
    _repo_id: String,
    _base_branch: String,
    _task_text: String,
) -> Result<Workspace, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn list_workspaces(_db: State<'_, DbState>) -> Result<Vec<Workspace>, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn archive_workspace(
    _db: State<'_, DbState>,
    _workspace_id: String,
) -> Result<(), AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn start_agent_run(
    _db: State<'_, DbState>,
    _registry: State<'_, RunRegistry>,
    _workspace_id: String,
    _prompt: String,
    _on_event: Channel<StreamEvent>,
) -> Result<AgentRun, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn stop_agent_run(
    _registry: State<'_, RunRegistry>,
    _run_id: String,
) -> Result<(), AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn list_runs(
    _db: State<'_, DbState>,
    _workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn get_workspace_diff(
    _db: State<'_, DbState>,
    _workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn discard_workspace_changes(
    _db: State<'_, DbState>,
    _workspace_id: String,
) -> Result<(), AppError> {
    unimplemented!("S1.7.3")
}

#[tauri::command]
#[specta::specta]
pub async fn check_claude_install() -> ClaudeInstall {
    unimplemented!("S1.7.3")
}
