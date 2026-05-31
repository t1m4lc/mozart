//! Single source of the `tauri_specta::Builder` construction. Reused by
//! `lib.rs::run()` (production wiring + dev-only TS export) and by the
//! `tests/bindings_export.rs` integration test added in S1.7.2.
//!
//! **`pub fn`, not `pub(crate)`** — integration tests under `tests/` link
//! the crate as an external consumer and require crate-public visibility.

use crate::auth::keyring_store::AuthSessionDto;
use crate::auth::DeepLinkReceived;
use crate::claude_cli::{install::ClaudeInstall, AgentRunTerminated, StreamEvent};
use crate::commands;
use crate::credentials::anthropic_probe::ProbeResult;
use crate::db::models::{
    AgentRun, Chat, Message, Repo, Task, Thread, Workspace, WorkspaceChange,
};
use crate::commit::ChangedFile;
use crate::error::AppError;
use crate::file_tree::{FileNodeDto, FileTreeEvent};
use crate::get_started::GetStartedProject;
use crate::github::{CreatedPr, GithubProbeResult, GithubRemoteStatus};
use crate::ide_launch::DetectedIde;
use crate::merge::MergeOutcome;
use crate::terminal::TerminalEvent;

pub fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    // The base command list is held in a local macro so it can be expanded
    // once in release and once (with extras appended) in debug.
    // `collect_commands!` doesn't accept `#[cfg]` on individual entries.
    macro_rules! base_commands {
        ($($extra:tt)*) => {
            tauri_specta::collect_commands![
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
                commands::reopen_workspace,
                commands::set_workspace_pinned,
                commands::set_workspace_unread,
                commands::start_agent_run,
                commands::stop_agent_run,
                commands::list_runs,
                commands::get_workspace_diff,
                commands::list_workspace_diff_stats,
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
                commands::probe_anthropic_reachability,
                commands::list_repository_tree,
                commands::watch_repository_tree,
                commands::unwatch_repository_tree,
                commands::get_file_diff,
                commands::read_workspace_file,
                commands::file_save,
                commands::open_terminal,
                commands::write_terminal,
                commands::resize_terminal,
                commands::close_terminal,
                commands::set_repo_run_command,
                commands::set_repo_setup_command,
                commands::start_workspace_run,
                commands::start_workspace_setup,
                commands::stop_workspace_run,
                commands::detect_installed_ides,
                commands::open_in_ide,
                commands::list_changed_files,
                commands::list_branch_diff_files,
                commands::commit_workspace,
                commands::stage_file,
                commands::unstage_file,
                commands::is_staged,
                commands::mark_file_viewed,
                commands::clear_file_view,
                commands::list_file_views,
                commands::mark_all_viewed,
                commands::has_github_token,
                commands::connect_github,
                commands::connect_github_via_clerk,
                commands::get_github_token_kind,
                commands::list_clerk_github_repos,
                commands::disconnect_github,
                commands::detect_github_remote_for_project,
                commands::push_workspace_branch,
                commands::create_workspace_pr,
                commands::open_path_in_file_manager,
                commands::merge_workspace_locally,
                commands::set_workspace_last_merge_action,
                commands::set_workspace_sandbox_level,
                commands::auth_load_session,
                commands::auth_save_session,
                commands::auth_clear_session,
                commands::auth_get_callback_port,
                commands::get_onboarding_completed,
                commands::set_onboarding_completed,
                commands::git_version,
                commands::git_identity,
                commands::spawn_claude_login,
                commands::create_get_started_project,
                commands::get_notification_preferences,
                commands::set_notification_preferences,
                commands::emit_message_end_notification,
                commands::play_chime,
                commands::detect_project,
                commands::bootstrap_project,
                commands::read_project_config,
                commands::get_resolved_settings,
                commands::resolve_workspace_commands,
                commands::save_global_settings
                $($extra)*
            ]
        };
    }

    #[cfg(debug_assertions)]
    let cmds = base_commands![
        , commands::reset_database_clean
        , commands::reset_database_with_demo_seed
    ];
    #[cfg(not(debug_assertions))]
    let cmds = base_commands![];

    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(cmds)
        .events(tauri_specta::collect_events![
            AgentRunTerminated,
            DeepLinkReceived
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
        .typ::<commands::WorkspaceDiffStats>()
        .typ::<Chat>()
        .typ::<Message>()
        .typ::<ProbeResult>()
        .typ::<FileNodeDto>()
        .typ::<FileTreeEvent>()
        .typ::<TerminalEvent>()
        .typ::<DetectedIde>()
        .typ::<MergeOutcome>()
        .typ::<ChangedFile>()
        .typ::<commands::FileViewState>()
        .typ::<commands::FileViewStatus>()
        .typ::<GithubProbeResult>()
        .typ::<GithubRemoteStatus>()
        .typ::<CreatedPr>()
        .typ::<AuthSessionDto>()
        .typ::<GetStartedProject>()
        .typ::<commands::NotificationPreferences>()
        .typ::<commands::GitIdentity>()
        .typ::<crate::settings::SettingsDto>()
}
