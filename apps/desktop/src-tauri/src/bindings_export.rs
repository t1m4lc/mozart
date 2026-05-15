//! Single source of the `tauri_specta::Builder` construction. Reused by
//! `lib.rs::run()` (production wiring + dev-only TS export) and by the
//! `tests/bindings_export.rs` integration test added in S1.7.2.
//!
//! **`pub fn`, not `pub(crate)`** — integration tests under `tests/` link
//! the crate as an external consumer and require crate-public visibility.

use crate::claude_cli::{install::ClaudeInstall, AgentRunTerminated, StreamEvent};
use crate::commands;
use crate::credentials::anthropic_probe::ProbeResult;
use crate::db::models::{
    AgentRun, Chat, Message, Repo, Task, Thread, Workspace, WorkspaceChange,
};
use crate::commit::ChangedFile;
use crate::error::AppError;
use crate::file_tree::{FileNodeDto, FileTreeEvent};
use crate::github::{CreatedPr, GithubProbeResult};
use crate::ide_launch::DetectedIde;
use crate::terminal::TerminalEvent;

pub fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::list_repos,
            commands::add_repo,
            commands::init_repo,
            commands::clone_repo,
            commands::create_project_folder,
            commands::install_workspace_packages,
            commands::remove_repo,
            commands::set_repo_icon,
            commands::set_repo_hidden,
            commands::set_repo_sort,
            commands::list_branches,
            commands::create_workspace,
            commands::list_workspaces,
            commands::list_tasks,
            commands::archive_workspace,
            commands::rename_workspace,
            commands::set_workspace_ui_status,
            commands::set_workspace_pinned,
            commands::set_workspace_unread,
            commands::start_agent_run,
            commands::stop_agent_run,
            commands::list_runs,
            commands::get_workspace_diff,
            commands::discard_workspace_changes,
            commands::list_chats,
            commands::list_all_chats,
            commands::create_chat,
            commands::rename_chat,
            commands::close_chat,
            commands::get_active_chat,
            commands::set_active_chat,
            commands::update_chat_mode,
            commands::update_chat_effort,
            commands::update_chat_model,
            commands::mark_chat_read,
            commands::list_messages,
            commands::insert_message,
            commands::update_message_content,
            commands::update_message_status,
            commands::update_message_timeline,
            commands::check_claude_install,
            commands::check_claude_code_session,
            commands::has_anthropic_key,
            commands::connect_anthropic,
            commands::disconnect_anthropic,
            commands::refresh_anthropic_connection,
            commands::list_repository_tree,
            commands::watch_repository_tree,
            commands::unwatch_repository_tree,
            commands::get_file_diff,
            commands::open_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            commands::set_repo_run_command,
            commands::start_workspace_run,
            commands::stop_workspace_run,
            commands::detect_installed_ides,
            commands::open_in_ide,
            commands::list_changed_files,
            commands::commit_workspace,
            commands::has_github_token,
            commands::connect_github,
            commands::disconnect_github,
            commands::push_workspace_branch,
            commands::create_workspace_pr,
        ])
        .events(tauri_specta::collect_events![AgentRunTerminated])
        .typ::<AppError>()
        .typ::<StreamEvent>()
        .typ::<ClaudeInstall>()
        .typ::<Repo>()
        .typ::<Task>()
        .typ::<Workspace>()
        .typ::<Thread>()
        .typ::<AgentRun>()
        .typ::<WorkspaceChange>()
        .typ::<Chat>()
        .typ::<Message>()
        .typ::<ProbeResult>()
        .typ::<FileNodeDto>()
        .typ::<FileTreeEvent>()
        .typ::<TerminalEvent>()
        .typ::<DetectedIde>()
        .typ::<ChangedFile>()
        .typ::<GithubProbeResult>()
        .typ::<CreatedPr>()
}
