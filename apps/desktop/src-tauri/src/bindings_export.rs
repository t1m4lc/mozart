//! Single source of the `tauri_specta::Builder` construction. Reused by
//! `lib.rs::run()` (production wiring + dev-only TS export) and by the
//! `tests/bindings_export.rs` integration test added in S1.7.2.
//!
//! **`pub fn`, not `pub(crate)`** — integration tests under `tests/` link
//! the crate as an external consumer and require crate-public visibility.

use crate::claude_cli::{install::ClaudeInstall, StreamEvent};
use crate::commands;
use crate::db::models::{AgentRun, Repo, Task, Thread, Workspace, WorkspaceChange};
use crate::error::AppError;

pub fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::list_repos,
            commands::add_repo,
            commands::list_branches,
            commands::create_workspace,
            commands::list_workspaces,
            commands::list_tasks,
            commands::archive_workspace,
            commands::start_agent_run,
            commands::stop_agent_run,
            commands::list_runs,
            commands::get_workspace_diff,
            commands::discard_workspace_changes,
            commands::check_claude_install,
        ])
        .typ::<AppError>()
        .typ::<StreamEvent>()
        .typ::<ClaudeInstall>()
        .typ::<Repo>()
        .typ::<Task>()
        .typ::<Workspace>()
        .typ::<Thread>()
        .typ::<AgentRun>()
        .typ::<WorkspaceChange>()
}
