//! Tauri command surface for Mozart's desktop app. Each command is
//! `#[tauri::command] #[specta::specta]` so `bindings_export.rs` can
//! collect them into a typed TS surface. v0.1.0-beta.1 = 12 commands per the
//! atomized plan (S1.7.1b — stubs; S1.7.3 — bodies).
//!
//! Field-naming contract (plan §4, D17 vocabulary): argument identifiers
//! use canonical concepts only (`workspace_id`, `task_id`, `run_id`,
//! `repo_id`, `prompt`, `path`). No `worktree_path` / `branch_name` /
//! `mozart/wip-…` may appear as command arguments.
//!
//! Each `#[tauri::command]` wrapper is a thin shim over a
//! `pub(crate) async fn <name>_impl(...)` that takes plain references
//! to `DbState` / `RunRegistry` instead of `tauri::State`. The split
//! exists so tests can drive the real command logic without a Tauri
//! runtime (`tauri::State` cannot be constructed in tests). The wrapper
//! is the spec surface; the `_impl` is the testable surface.

use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::auth::keyring_store::{self as auth_store, AuthSessionDto};
use crate::claude_cli::codex_session;
use crate::claude_cli::context_compiler;
use crate::claude_cli::install::{self, ClaudeInstall};
use crate::claude_cli::providers::{AgentProvider, ClaudeCliRenderer, CodexRenderer, EnvelopeRenderer};
use crate::claude_cli::session;
use crate::claude_cli::{spawn_run, AgentRunTerminated, StreamEvent};
use crate::credentials::anthropic_probe::{self, ProbeResult};
use crate::credentials::keyring_store::{self, GithubTokenKind};
use crate::credentials::openai_probe;
use crate::db::agent_run_envelopes::ENVELOPE_RETENTION_PER_CHAT;
use crate::db::models::{AgentRun, AgentRunEnvelope, Chat, Message, Repo, Task, Workspace, WorkspaceChange};
use crate::db::{
    agent_run_envelopes, agent_runs, chats, config, messages, new_id, now_ms, repos, tasks,
    threads, workspace_active_chat, workspace_changes, workspace_file_views, workspaces,
};
use crate::db::workspace_file_views::WorkspaceFileView;
use crate::db::DbState;
use crate::error::AppError;
use crate::commit::{self, ChangedFile};
use crate::staging;
use crate::file_diff;
use crate::file_tree::{self, FileNodeDto, FileTreeEvent};
use crate::file_tree_cache::FileTreeCache;
use crate::file_watcher_registry::FileWatcherRegistry;
use crate::github::{self, CreatedPr, GithubProbeResult};
use crate::ide_launch::{self, DetectedIde};
use crate::merge::{self, MergeOutcome};
use crate::path_guard::{self, validate_workspace_relative_path};
use crate::terminal::{self, TerminalEvent};
use crate::terminal_registry::TerminalRegistry;
use crate::workspace_run_registry::WorkspaceRunRegistry;
use crate::git_query;
use crate::run_registry::RunRegistry;
use crate::sandbox;
use crate::workspace_service;
use crate::worktree;

#[tauri::command]
#[specta::specta]
pub async fn list_repos(db: State<'_, DbState>) -> Result<Vec<Repo>, AppError> {
    list_repos_impl(db.inner()).await
}

pub(crate) async fn list_repos_impl(db: &DbState) -> Result<Vec<Repo>, AppError> {
    let conn = db.lock();
    repos::list(&conn)
}

/// Discover skills for the active `provider` (`claude`/`codex`), scoped to a
/// project when `project_id` is given. Always includes the provider's global
/// skills (`~/.<provider>/skills`); when a project is in context, also its
/// repo-local `.mozart/skills` and `.<provider>/skills` (see `crate::skills`).
///
/// The repository PATH is resolved here from `project_id` (the repo id) and
/// never crosses the IPC boundary — the frontend passes stable ids only. The
/// `SkillsStore` caches per provider+project, so the FS isn't rescanned on
/// every slash-menu open. The scan runs on a blocking thread to keep the async
/// runtime responsive.
#[tauri::command]
#[specta::specta]
pub async fn list_skills(
    db: State<'_, DbState>,
    provider: String,
    project_id: Option<String>,
) -> Result<Vec<crate::skills::Skill>, AppError> {
    list_skills_impl(db.inner(), provider, project_id).await
}

pub(crate) async fn list_skills_impl(
    db: &DbState,
    provider: String,
    project_id: Option<String>,
) -> Result<Vec<crate::skills::Skill>, AppError> {
    let provider = crate::skills::Provider::from_agent_id(&provider);
    // Resolve the repo path from the project id under the lock, then drop it
    // before the (potentially slow) filesystem scan.
    let repo_path = match project_id {
        Some(id) => {
            let conn = db.lock();
            Some(repos::get(&conn, &id)?.path)
        }
        None => None,
    };
    tokio::task::spawn_blocking(move || {
        crate::skills::discover(provider, repo_path.as_deref().map(std::path::Path::new))
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn add_repo(db: State<'_, DbState>, path: String) -> Result<Repo, AppError> {
    add_repo_impl(db.inner(), path).await
}

pub(crate) async fn add_repo_impl(db: &DbState, path: String) -> Result<Repo, AppError> {
    let p = std::path::Path::new(&path);
    // Validate. Phase 1 deliberately refuses non-git folders with the
    // sentinel "NotARepo" so the frontend can detect it and prompt the
    // user via the Initialize-project dialog (see `init_repo` command).
    // Other RepoIssue variants (nested, detached HEAD, submodules, LFS)
    // surface as Validation with the debug-formatted issue.
    match git_query::validate_repo(p).await {
        Ok(()) => {}
        Err(git_query::RepoIssue::NotARepo) => {
            return Err(AppError::Validation("NotARepo".into()));
        }
        Err(other) => {
            return Err(AppError::Validation(format!(
                "repo not usable: {other:?}"
            )));
        }
    }
    let conn = db.lock();
    // Idempotent: if path already registered, return the existing row.
    if let Ok(existing) = repos::get_by_path(&conn, &path) {
        return Ok(existing);
    }
    let r = Repo {
        repo_id: new_id(),
        path: path.clone(),
        display_name: p
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone()),
        added_at: now_ms(),
        icon: None,
        hidden: false,
        sort_index: 0,
        run_command: None,
        setup_command: None,
    };
    repos::create(&conn, &r)?;
    Ok(r)
}

/// Run `git init --initial-branch=main` + identity config + an initial
/// empty commit at `path` so the folder becomes a valid git repository
/// Mozart can register. Called by the frontend after the user confirms
/// the Initialize-project dialog (triggered when `add_repo` returns the
/// `NotARepo` validation error).
#[tauri::command]
#[specta::specta]
pub async fn init_repo(path: String) -> Result<(), AppError> {
    init_repo_impl(path).await
}

pub(crate) async fn init_repo_impl(path: String) -> Result<(), AppError> {
    git_query::init_repo(std::path::Path::new(&path)).await
}

/// Outcome of an attempt to install package-manager dependencies for a
/// workspace. `ran=false` means no `package.json` was found; the other
/// two flags describe what happened when we did try.
#[derive(serde::Serialize, specta::Type, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    /// Detected package manager. "none" when ran=false.
    pub manager: String,
    /// True if a package.json was present and we attempted install.
    pub ran: bool,
    /// True iff the install command exited 0.
    pub success: bool,
    /// Stderr tail on failure (empty otherwise). Bounded so we don't
    /// dump megabytes of npm output back to the UI.
    pub message: String,
}

/// Detect the package manager for `workspace_id`'s worktree and run
/// `<manager> install`. Used by the Phase 1 add-project flow to make
/// the freshly-cloned workspace immediately usable. Non-blocking
/// from the user's perspective: the frontend fires this without
/// awaiting and toasts the outcome.
///
/// Detection order: pnpm-lock.yaml -> yarn.lock -> package-lock.json
/// -> npm (default when package.json exists but no lockfile).
#[tauri::command]
#[specta::specta]
pub async fn install_workspace_packages(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<InstallResult, AppError> {
    install_workspace_packages_impl(db.inner(), workspace_id).await
}

pub(crate) async fn install_workspace_packages_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<InstallResult, AppError> {
    // Plan P0.2 freeze guard — `pnpm install` mutates the worktree
    // (node_modules + lockfile), so it's blocked on `done` workspaces.
    // Resolve the worktree path. Holding the lock across the install
    // would block other DB ops for minutes — read the path and drop.
    let worktree_path = {
        let conn = db.lock();
        crate::db::workspaces::assert_workspace_active(&conn, &workspace_id)?;
        let ws = crate::db::workspaces::get(&conn, &workspace_id)?;
        ws.worktree_path
    };

    use crate::platform::NoWindow;
    let worktree = std::path::Path::new(&worktree_path);

    // Resolve the package manager AND its real executable (npm.cmd on
    // Windows) up-front. `None` => no package.json.
    let Some(pm) = crate::platform::resolve_package_manager(worktree) else {
        return Ok(InstallResult {
            manager: "none".into(),
            ran: false,
            success: false,
            message: String::new(),
        });
    };

    // Serialize installs per workspace so a duplicate / concurrent call
    // cannot spawn a second package-manager process tree (on Windows each
    // child flashed a console — the runaway-terminal loop).
    let install_lock = install_lock_for(&workspace_id);
    let _install_guard = install_lock.lock().await;

    // Idempotent: if dependencies are already installed (a retry, or a
    // second call that raced the first), don't re-run.
    if worktree.join("node_modules").exists() {
        return Ok(InstallResult {
            manager: pm.name.to_string(),
            ran: true,
            success: true,
            message: String::new(),
        });
    }

    let output = tokio::process::Command::new(&pm.program)
        .arg("install")
        .current_dir(worktree)
        // Augment PATH so managers installed via nvm, volta, etc. are
        // found even when the app was launched from a GUI launcher with
        // a minimal system PATH.
        .env("PATH", crate::shell_env::augmented_path())
        .no_window()
        .output()
        .await
        .map_err(|e| AppError::Io(format!("spawn {} install: {e}", pm.name)))?;

    let success = output.status.success();
    let stderr_tail = if success {
        String::new()
    } else {
        // Cap at 2 KiB so the toast description stays readable.
        let s = String::from_utf8_lossy(&output.stderr);
        let trimmed = s.trim();
        let limit = 2048usize.min(trimmed.len());
        trimmed[trimmed.len() - limit..].to_string()
    };

    Ok(InstallResult {
        manager: pm.name.to_string(),
        ran: true,
        success,
        message: stderr_tail,
    })
}

/// Per-workspace install serialization (see `install_workspace_packages_impl`).
/// Calls for one workspace queue on this lock; once the first install
/// finishes the rest short-circuit on the `node_modules` idempotency check.
fn install_lock_for(workspace_id: &str) -> std::sync::Arc<tokio::sync::Mutex<()>> {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex, OnceLock};
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    let map = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = map.lock().expect("install locks poisoned");
    guard.entry(workspace_id.to_string()).or_default().clone()
}

/// Create an empty directory `<parent>/<name>` for a fresh "Quick start"
/// project. Validates inputs, refuses if the target already exists, and
/// returns the canonicalised absolute path so the frontend can hand it
/// to the unified add-project flow (which will trigger `git init` next).
#[tauri::command]
#[specta::specta]
pub async fn create_project_folder(parent: String, name: String) -> Result<String, AppError> {
    create_project_folder_impl(parent, name).await
}

pub(crate) async fn create_project_folder_impl(
    parent: String,
    name: String,
) -> Result<String, AppError> {
    let parent_trim = parent.trim();
    let name_trim = name.trim();
    if parent_trim.is_empty() {
        return Err(AppError::Validation("parent folder is empty".into()));
    }
    if name_trim.is_empty() {
        return Err(AppError::Validation("project name is empty".into()));
    }
    // Reject path separators in `name` so the user can't accidentally
    // nest by typing "foo/bar" — Quick start is a single-level create.
    if name_trim.contains('/') || name_trim.contains('\\') {
        return Err(AppError::Validation(
            "project name cannot contain path separators".into(),
        ));
    }

    let parent_path = std::path::Path::new(parent_trim);
    // Ensure parent exists (Quick start may seed `<home>/mozart/projects`
    // even if the user has never used that folder before).
    std::fs::create_dir_all(parent_path)
        .map_err(|e| AppError::Io(format!("create {}: {e}", parent_path.display())))?;

    let target = parent_path.join(name_trim);
    if target.exists() {
        return Err(AppError::Validation(format!(
            "destination already exists: {}",
            target.display()
        )));
    }
    std::fs::create_dir(&target)
        .map_err(|e| AppError::Io(format!("create {}: {e}", target.display())))?;

    let canon = target
        .canonicalize()
        .map_err(|e| AppError::Io(format!("canonicalize created path: {e}")))?
        .to_string_lossy()
        .into_owned();
    Ok(canon)
}

/// Clone the git repository at `url` into `<dest_dir>/<name>`, where
/// `name` is derived from the URL (last `/`-segment, trailing `.git`
/// stripped). Creates `dest_dir` if it does not exist. Returns the
/// absolute path of the cloned folder so the frontend can hand it to
/// `add_repo` for registration.
///
/// Refuses `file://` URLs (only http/https/ssh-like remote URLs are
/// allowed). Refuses if `<dest_dir>/<name>` already exists — the user
/// should pick a different location or remove the existing folder.
#[tauri::command]
#[specta::specta]
pub async fn clone_repo(url: String, dest_dir: String) -> Result<String, AppError> {
    clone_repo_impl(url, dest_dir).await
}

pub(crate) async fn clone_repo_impl(
    url: String,
    dest_dir: String,
) -> Result<String, AppError> {
    let url_trim = url.trim();
    if url_trim.is_empty() {
        return Err(AppError::Validation("clone url is empty".into()));
    }
    let lower = url_trim.to_ascii_lowercase();
    if lower.starts_with("file://") {
        return Err(AppError::Validation(
            "local file:// URLs are not allowed".into(),
        ));
    }

    let name = derive_clone_repo_name(url_trim)?;

    let dest_root = std::path::Path::new(&dest_dir);
    if dest_dir.trim().is_empty() {
        return Err(AppError::Validation("destination directory is empty".into()));
    }
    std::fs::create_dir_all(dest_root)
        .map_err(|e| AppError::Io(format!("create {}: {e}", dest_root.display())))?;

    let target = dest_root.join(&name);
    if target.exists() {
        return Err(AppError::Validation(format!(
            "destination already exists: {}",
            target.display()
        )));
    }

    let target_str = target.to_string_lossy().into_owned();
    sandbox::run_git(dest_root, &["clone", url_trim, &target_str]).await?;

    let canon = target
        .canonicalize()
        .map_err(|e| AppError::Io(format!("canonicalize cloned path: {e}")))?
        .to_string_lossy()
        .into_owned();
    Ok(canon)
}

/// Derive the repository name from a clone URL. Strips trailing slashes
/// and `.git` so both `https://github.com/foo/bar`,
/// `https://github.com/foo/bar.git`, and `git@github.com:foo/bar.git`
/// yield `bar`.
fn derive_clone_repo_name(url: &str) -> Result<String, AppError> {
    let trimmed = url.trim().trim_end_matches('/');
    // SSH-style URLs use `:` as the host/path separator (e.g.
    // `git@github.com:foo/bar.git`). Split on `/` and `:` so the last
    // segment is the repo name in both forms.
    let last = trimmed
        .rsplit(|c| c == '/' || c == ':')
        .next()
        .unwrap_or("");
    let stripped = last.trim_end_matches(".git");
    if stripped.is_empty() {
        return Err(AppError::Validation(format!(
            "could not derive repo name from url: {url}"
        )));
    }
    Ok(stripped.to_string())
}

#[cfg(test)]
mod derive_clone_repo_name_tests {
    use super::derive_clone_repo_name;

    #[test]
    fn https_with_git_suffix() {
        assert_eq!(
            derive_clone_repo_name("https://github.com/foo/bar.git").unwrap(),
            "bar"
        );
    }

    #[test]
    fn https_no_suffix() {
        assert_eq!(
            derive_clone_repo_name("https://github.com/foo/bar").unwrap(),
            "bar"
        );
    }

    #[test]
    fn trailing_slash_tolerated() {
        assert_eq!(
            derive_clone_repo_name("https://github.com/foo/bar/").unwrap(),
            "bar"
        );
    }

    #[test]
    fn ssh_form() {
        assert_eq!(
            derive_clone_repo_name("git@github.com:foo/bar.git").unwrap(),
            "bar"
        );
    }

    #[test]
    fn refuses_only_slashes() {
        assert!(derive_clone_repo_name("///").is_err());
    }
}

#[tauri::command]
#[specta::specta]
pub async fn remove_repo(db: State<'_, DbState>, repo_id: String) -> Result<(), AppError> {
    remove_repo_impl(db.inner(), repo_id).await
}

pub(crate) async fn remove_repo_impl(db: &DbState, repo_id: String) -> Result<(), AppError> {
    // Snapshot the on-disk state we own BEFORE the DB rows vanish.
    // After the cascade delete, `workspaces.worktree_path`, `branch_name`,
    // and `repos.path` are unreachable — so capture all three here.
    let (repo_path, workspace_data) = {
        let conn = db.lock();
        let repo = repos::get(&conn, &repo_id)?;
        let task_rows = tasks::list_by_repo(&conn, &repo_id)?;
        let mut data: Vec<(std::path::PathBuf, String)> = Vec::new();
        for t in &task_rows {
            for w in workspaces::list_by_task(&conn, &t.task_id)? {
                data.push((
                    std::path::PathBuf::from(w.worktree_path),
                    w.branch_name,
                ));
            }
        }
        (std::path::PathBuf::from(repo.path), data)
    };

    // 1. Drop every DB row associated with this repo (in one tx with
    //    deferred FKs — order-tolerant). Failure here aborts before
    //    the filesystem wipe, so the user can retry without leftover
    //    DB ghosts.
    {
        let mut conn = db.lock();
        repos::delete(&mut conn, &repo_id)?;
    }

    // 2. Best-effort filesystem + branch cleanup. Anything that fails here
    //    is logged + skipped: the DB rows are already gone, so a stuck
    //    worktree or branch shouldn't surface as a "couldn't remove project"
    //    toast. `cleanup_orphans` (called at startup) sweeps up leftover dirs.
    //
    //    Order: each workspace's worktree + branch first, then the
    //    per-project parent dir, then the `<data>/projects/<seg>` sandbox dir.
    let mut project_parents: std::collections::HashSet<std::path::PathBuf> =
        std::collections::HashSet::new();
    for (wt_path, branch_name) in &workspace_data {
        if let Err(e) = worktree::remove(&repo_path, wt_path).await {
            eprintln!(
                "[remove_repo] worktree::remove({}) failed: {e:?}",
                wt_path.display()
            );
        }
        if let Err(e) = worktree::delete_branch(&repo_path, branch_name).await {
            eprintln!("[remove_repo] delete_branch({branch_name}) failed: {e:?}");
        }
        if let Some(parent) = wt_path.parent() {
            project_parents.insert(parent.to_path_buf());
        }
    }
    // `remove_dir` only succeeds on an empty dir — exactly what we
    // want, so a project_seg dir shared with another (unrelated) repo
    // never gets wiped accidentally.
    for parent in &project_parents {
        let _ = std::fs::remove_dir(parent);
    }
    // Sandbox dir at `<data>/projects/<project_seg>`. Inferred from
    // the worktree parent basename — same slug derivation as
    // `worktree::create_for_workspace`. Best-effort: missing or
    // shared-by-another-project leaves it alone.
    if let Ok(projects_root) = crate::paths::projects_root() {
        for parent in &project_parents {
            if let Some(seg) = parent.file_name() {
                let dir = projects_root.join(seg);
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_repo_icon(
    db: State<'_, DbState>,
    repo_id: String,
    icon: Option<String>,
) -> Result<(), AppError> {
    set_repo_icon_impl(db.inner(), repo_id, icon).await
}

pub(crate) async fn set_repo_icon_impl(
    db: &DbState,
    repo_id: String,
    icon: Option<String>,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_icon(&conn, &repo_id, icon.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn set_repo_hidden(
    db: State<'_, DbState>,
    repo_id: String,
    hidden: bool,
) -> Result<(), AppError> {
    set_repo_hidden_impl(db.inner(), repo_id, hidden).await
}

pub(crate) async fn set_repo_hidden_impl(
    db: &DbState,
    repo_id: String,
    hidden: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_hidden(&conn, &repo_id, hidden)
}

/// Apply a complete project ordering. `ordered_ids[i]` gets
/// `sort_index = i`. The Angular store debounces drag bursts so this
/// fires once per drop, not per dragOver.
#[tauri::command]
#[specta::specta]
pub async fn set_repo_sort(
    db: State<'_, DbState>,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    set_repo_sort_impl(db.inner(), ordered_ids).await
}

pub(crate) async fn set_repo_sort_impl(
    db: &DbState,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut conn = db.lock();
    repos::set_sort(&mut conn, &ordered_ids)
}

#[tauri::command]
#[specta::specta]
pub async fn list_branches(repo_path: String) -> Result<Vec<String>, AppError> {
    git_query::list_branches(std::path::Path::new(&repo_path)).await
}

/// The repo's currently checked-out branch, or `None` on a detached
/// HEAD. Backs the create-workspace base-branch default so a new
/// workspace forks from (and its PR targets) the branch the user is on.
#[tauri::command]
#[specta::specta]
pub async fn current_branch(repo_path: String) -> Result<Option<String>, AppError> {
    git_query::current_branch(std::path::Path::new(&repo_path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_workspace(
    db: State<'_, DbState>,
    repo_id: String,
    base_branch: String,
    task_text: String,
    workspace_name: String,
) -> Result<Workspace, AppError> {
    create_workspace_impl(db.inner(), repo_id, base_branch, task_text, workspace_name).await
}

pub(crate) async fn create_workspace_impl(
    db: &DbState,
    repo_id: String,
    base_branch: String,
    task_text: String,
    workspace_name: String,
) -> Result<Workspace, AppError> {
    // Resolve repo_id -> repo_path via repos::get (added in S1.7.1a).
    let repo_path = {
        let conn = db.lock();
        repos::get(&conn, &repo_id)?.path
    };
    workspace_service::create_workspace(
        db,
        &repo_id,
        std::path::Path::new(&repo_path),
        &base_branch,
        &task_text,
        &workspace_name,
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_workspaces(db: State<'_, DbState>) -> Result<Vec<Workspace>, AppError> {
    list_workspaces_impl(db.inner()).await
}

pub(crate) async fn list_workspaces_impl(db: &DbState) -> Result<Vec<Workspace>, AppError> {
    let conn = db.lock();
    workspaces::list_all(&conn)
}

#[tauri::command]
#[specta::specta]
pub async fn list_tasks(
    db: State<'_, DbState>,
    repo_id: String,
) -> Result<Vec<Task>, AppError> {
    list_tasks_impl(db.inner(), repo_id).await
}

pub(crate) async fn list_tasks_impl(
    db: &DbState,
    repo_id: String,
) -> Result<Vec<Task>, AppError> {
    let conn = db.lock();
    tasks::list_by_repo(&conn, &repo_id)
}

#[tauri::command]
#[specta::specta]
pub async fn archive_workspace(
    db: State<'_, DbState>,
    terminal_registry: State<'_, TerminalRegistry>,
    workspace_run_registry: State<'_, WorkspaceRunRegistry>,
    file_watcher_registry: State<'_, FileWatcherRegistry>,
    workspace_id: String,
) -> Result<(), AppError> {
    // Release per-workspace runtime resources before flipping the
    // deletion intent. Cancelling each registry drops the held handle:
    // PTYs (terminal + run) get killed, the notify-debouncer stops.
    terminal_registry.cancel(&workspace_id);
    workspace_run_registry.cancel(&workspace_id);
    file_watcher_registry.cancel(&workspace_id);
    archive_workspace_impl(db.inner(), workspace_id).await
}

pub(crate) async fn archive_workspace_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<(), AppError> {
    // Resolve the on-disk worktree path, repo path, and branch name so we
    // can wipe the directory and delete the git branch. Scoped block
    // releases the lock before the async git calls below.
    let (repo_path, worktree_path, branch_name) = {
        let conn = db.lock();
        let ws = workspaces::get(&conn, &workspace_id)?;
        let task = tasks::get(&conn, &ws.task_id)?;
        let repo = repos::get(&conn, &task.repo_id)?;
        (
            std::path::PathBuf::from(repo.path),
            std::path::PathBuf::from(ws.worktree_path),
            ws.branch_name,
        )
    };

    // Disk wipe BEFORE flipping deletion_intent: if either removal fails
    // the row stays visible and the user can retry. Doing it the
    // other way around would leak the directory permanently because
    // `cleanup_orphans` skips paths still referenced by any row,
    // including soft-deleted ones.
    worktree::remove(&repo_path, &worktree_path).await?;
    worktree::delete_branch(&repo_path, &branch_name).await?;

    let conn = db.lock();
    workspaces::set_deletion_intent(&conn, &workspace_id, true)
}

/// Rename the user-facing workspace title. Intentionally does NOT
/// touch `branch_name` — the branch is derived from the original
/// name at create time and never re-derived (vocabulary contract).
#[tauri::command]
#[specta::specta]
pub async fn rename_workspace(
    db: State<'_, DbState>,
    workspace_id: String,
    name: String,
) -> Result<(), AppError> {
    rename_workspace_impl(db.inner(), workspace_id, name).await
}

pub(crate) async fn rename_workspace_impl(
    db: &DbState,
    workspace_id: String,
    name: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_name(&conn, &workspace_id, &name)
}

/// Set the kanban-lane label. The backend does not validate the value
/// against an enum; the Angular side owns the closed-set of allowed
/// `UiWorkspaceStatus` strings.
#[tauri::command]
#[specta::specta]
pub async fn set_workspace_ui_status(
    db: State<'_, DbState>,
    workspace_id: String,
    ui_status: String,
) -> Result<(), AppError> {
    set_workspace_ui_status_impl(db.inner(), workspace_id, ui_status).await
}

pub(crate) async fn set_workspace_ui_status_impl(
    db: &DbState,
    workspace_id: String,
    ui_status: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_ui_status(&conn, &workspace_id, &ui_status)
}

/// Lift a workspace out of the frozen `done` UI state so the user can
/// edit and run agents again. Flips `ui_status` to the caller-chosen
/// `target_ui_status` (the user's pick from the status menu) and
/// resets the runtime `status` to `ready`. Returns `Validation` if the
/// workspace isn't currently frozen, or if the target is itself
/// `done` (that would be a no-op pretending to be a reopen).
#[tauri::command]
#[specta::specta]
pub async fn reopen_workspace(
    db: State<'_, DbState>,
    workspace_id: String,
    target_ui_status: String,
) -> Result<(), AppError> {
    reopen_workspace_impl(db.inner(), workspace_id, target_ui_status).await
}

pub(crate) async fn reopen_workspace_impl(
    db: &DbState,
    workspace_id: String,
    target_ui_status: String,
) -> Result<(), AppError> {
    if target_ui_status == "done" || target_ui_status == "canceled" {
        return Err(AppError::Validation(
            "reopen target cannot be a frozen state (`done` or `canceled`)".into(),
        ));
    }
    let conn = db.lock();
    if !workspaces::is_frozen(&conn, &workspace_id)? {
        return Err(AppError::Validation(format!(
            "workspace {workspace_id} is not frozen"
        )));
    }
    workspaces::set_ui_status(&conn, &workspace_id, &target_ui_status)?;
    workspaces::update_status(&conn, &workspace_id, "ready")?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_workspace_pinned(
    db: State<'_, DbState>,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    set_workspace_pinned_impl(db.inner(), workspace_id, pinned).await
}

pub(crate) async fn set_workspace_pinned_impl(
    db: &DbState,
    workspace_id: String,
    pinned: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_pinned(&conn, &workspace_id, pinned)
}

#[tauri::command]
#[specta::specta]
pub async fn set_workspace_unread(
    db: State<'_, DbState>,
    workspace_id: String,
    unread: bool,
) -> Result<(), AppError> {
    set_workspace_unread_impl(db.inner(), workspace_id, unread).await
}

pub(crate) async fn set_workspace_unread_impl(
    db: &DbState,
    workspace_id: String,
    unread: bool,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_unread(&conn, &workspace_id, unread)
}

/// Persist the workspace's last merge-action choice (`'pr'` or `'local'`).
/// The right-aside primary-button label routes off this column with
/// `project_local_config.merge_mode` as the fallback. Fires on every
/// click of either dropdown option — outcome-independent, mirroring the
/// existing Open-in-IDE last-used pattern (AD-02).
#[tauri::command]
#[specta::specta]
pub async fn set_workspace_last_merge_action(
    db: State<'_, DbState>,
    workspace_id: String,
    action: String,
) -> Result<(), AppError> {
    if action != "pr" && action != "local" {
        return Err(AppError::Validation(format!(
            "last_merge_action must be 'pr' or 'local', got '{action}'"
        )));
    }
    let conn = db.lock();
    workspaces::set_last_merge_action(&conn, &workspace_id, &action)
}

/// Change a workspace's [`SandboxLevel`]. Validated against
/// `SandboxLevel::from_str` before writing — an unknown string
/// surfaces as `AppError::Validation` rather than silently widening
/// the agent's reach via a bogus DB row.
///
/// **No UI in v0.** The toggle UI ships with the Security settings
/// panel (TODO-008). For now this command is reachable only via the
/// devtools (`__TAURI__.invoke('set_workspace_sandbox_level', …)`) and
/// from E2E tests; that's intentional per /plan-devex-review
/// 2026-05-19 (first-run users have no context to interpret a
/// "Mozart-wide / project / workspace-only" choice without a security
/// surface around it).
#[tauri::command]
#[specta::specta]
pub async fn set_workspace_sandbox_level(
    db: State<'_, DbState>,
    workspace_id: String,
    level: String,
) -> Result<(), AppError> {
    set_workspace_sandbox_level_impl(db.inner(), workspace_id, level).await
}

pub(crate) async fn set_workspace_sandbox_level_impl(
    db: &DbState,
    workspace_id: String,
    level: String,
) -> Result<(), AppError> {
    use std::str::FromStr;
    // Parse before touching the DB — refuse to write anything that
    // wouldn't round-trip back through `SandboxLevel::from_str` later.
    let parsed = crate::claude_cli::sandbox_policy::SandboxLevel::from_str(&level)?;
    let canonical = parsed.to_string();
    let conn = db.lock();
    workspaces::set_sandbox_level(&conn, &workspace_id, &canonical)
}

#[tauri::command]
#[specta::specta]
pub async fn start_agent_run(
    db: State<'_, DbState>,
    registry: State<'_, RunRegistry>,
    app: tauri::AppHandle,
    workspace_id: String,
    chat_id: String,
    current_user_message_id: String,
    mode: String,
    provider: String,
    model: Option<String>,
    on_event: Channel<StreamEvent>,
) -> Result<AgentRun, AppError> {
    // Capture an owned `AppHandle` so the emitter closure can outlive the
    // command frame. Q2: tauri-specta event drives natural-end on the front.
    let app_clone = app.clone();
    start_agent_run_impl(
        db.inner(),
        registry.inner(),
        workspace_id,
        chat_id,
        current_user_message_id,
        mode,
        provider,
        model,
        on_event,
        move |ev| {
            use tauri_specta::Event;
            // Best-effort: an emit failure (e.g. webview gone during
            // shutdown) is logged and swallowed — the run is already
            // terminal in the DB and the UI will reconcile on next list.
            if let Err(e) = ev.emit(&app_clone) {
                log::warn!("AgentRunTerminated emit failed: {e}");
            }
        },
    )
    .await
}

pub(crate) async fn start_agent_run_impl<E>(
    db: &DbState,
    registry: &RunRegistry,
    workspace_id: String,
    chat_id: String,
    current_user_message_id: String,
    mode: String,
    provider: String,
    model: Option<String>,
    on_event: Channel<StreamEvent>,
    emit_terminated: E,
) -> Result<AgentRun, AppError>
where
    E: Fn(AgentRunTerminated) + Send + Sync + 'static,
{
    // Fail-closed: an unknown provider id resolves to the Claude CLI path.
    let agent_provider = AgentProvider::from_id(&provider);
    // D20: 1:1 workspace -> thread traversal. Plan P0.2: refuse on
    // frozen workspaces — ALL modes, including `ask`. (See full
    // rationale in the prior comment block.)
    let (ws, thread) = {
        let conn = db.lock();
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
        (
            workspaces::get(&conn, &workspace_id)?,
            threads::get_by_workspace(&conn, &workspace_id)?,
        )
    };

    // ContextCompiler v1 (T5) — build the structured envelope from
    // SQLite + render it for the Claude CLI provider. Fail-closed on
    // context errors: spawning a context-free agent is worse than a
    // visible "context unavailable" affordance in chat.
    //
    // TODO(D4): build_envelope currently runs over the shared mutexed
    // connection. The architecture calls for a per-call ROnly read
    // connection (`SQLITE_OPEN_READ_ONLY`) so the primary mutex stays
    // free during context builds. Deferred until DbState retains the
    // db_path — that's a small follow-up refactor.
    let build_result = {
        let conn = db.lock();
        context_compiler::build_envelope(
            &conn,
            &workspace_id,
            &chat_id,
            &current_user_message_id,
        )?
    };
    let envelope = build_result.envelope;
    let stats = build_result.stats;
    let prompt_text = envelope.current_user_message.content.clone();

    // Render with the provider's renderer. Both produce the same nonce-framed
    // flat text; they differ only in the `provider` tag stamped onto the
    // audit row (`agent_run_envelopes.provider`).
    let rendered = match agent_provider {
        AgentProvider::ClaudeCli => ClaudeCliRenderer::default().render(&envelope),
        AgentProvider::Codex => CodexRenderer::default().render(&envelope),
    };

    let run = AgentRun {
        run_id: new_id(),
        thread_id: thread.thread_id,
        // `agent_runs.prompt` is the bare user input now — same string
        // the user typed. The rendered envelope is a separate audit
        // artifact in `agent_run_envelopes.rendered_text`.
        prompt: prompt_text,
        status: "running".into(),
        started_at: now_ms(),
        ended_at: None,
        exit_code: None,
        error_message: None,
        checkpoint_sha: None,
        prompt_source: "message_content".into(),
    };
    let envelope_row = AgentRunEnvelope {
        run_id: run.run_id.clone(),
        chat_id: chat_id.clone(),
        envelope_json: serde_json::to_string(&envelope).unwrap_or_else(|e| {
            log::warn!("envelope_json serialize failed: {e}");
            String::new()
        }),
        rendered_text: rendered.bytes.clone(),
        provider: rendered.provider.clone(),
        nonce: rendered.nonce.clone(),
        char_count: rendered.char_count as i64,
        est_tokens: rendered.est_tokens as i64,
        created_at: now_ms(),
    };
    {
        let mut conn = db.lock();
        agent_runs::create(&conn, &run)?;
        agent_run_envelopes::insert_with_retention(
            &mut conn,
            &envelope_row,
            ENVELOPE_RETENTION_PER_CHAT,
        )?;
    }
    log::debug!(
        "agent_run spawn: run_id={} chat_id={} recent={} summaries={} chars={} est_tokens={} budget_hit={}",
        run.run_id,
        chat_id,
        stats.messages_count_recent,
        stats.summaries_count,
        stats.char_count,
        stats.est_tokens,
        stats.budget_hit
    );
    // Compensating cleanup on pre-stream spawn failure: agent_runs::create
    // ran above with status='running'. If spawn_run errors (binary missing,
    // stdin write/shutdown failed, git_checkpoint blew up), the supervisor
    // task never started so emit_terminated will never fire. Without this
    // flip, the run sits at 'running' forever in DB and the UI shows a
    // phantom spinner. Mark it 'error' so the next hydrate sees it and the
    // interrupted-message recovery path can finalize.
    let handle =
        match spawn_run(
            &ws,
            &run,
            &rendered.bytes,
            &mode,
            agent_provider,
            model.as_deref(),
            on_event,
            db,
            emit_terminated,
        )
        .await
        {
            Ok(h) => h,
            Err(e) => {
                let conn = db.lock();
                let err_msg = e.to_string();
                if let Err(cleanup_err) = agent_runs::mark_ended(
                    &conn,
                    &run.run_id,
                    "error",
                    now_ms(),
                    None,
                    Some(&format!("spawn failed: {err_msg}")),
                ) {
                    log::warn!(
                        "agent_runs::mark_ended after spawn failure failed: {cleanup_err}"
                    );
                }
                return Err(e);
            }
        };
    registry.register(run.run_id.clone(), Arc::new(handle));
    Ok(run)
}

#[tauri::command]
#[specta::specta]
pub async fn stop_agent_run(
    registry: State<'_, RunRegistry>,
    run_id: String,
) -> Result<(), AppError> {
    stop_agent_run_impl(registry.inner(), run_id).await
}

pub(crate) async fn stop_agent_run_impl(
    registry: &RunRegistry,
    run_id: String,
) -> Result<(), AppError> {
    registry.cancel(&run_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_runs(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    list_runs_impl(db.inner(), workspace_id).await
}

pub(crate) async fn list_runs_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    let conn = db.lock();
    let thread = threads::get_by_workspace(&conn, &workspace_id)?;
    agent_runs::list_by_thread(&conn, &thread.thread_id)
}

/// Dev-only inspector read: the persisted `agent_run_envelopes` row for a
/// run (structured `envelope_json` + exact `rendered_text` + char/token
/// stats). `#[cfg(debug_assertions)]` keeps the command out of release
/// binaries entirely — the LLM debug view is dev-only by requirement.
/// A missing row (legacy run, evicted by retention, or a run that errored
/// before the writer fired) maps to `Ok(None)` so the UI shows an empty
/// state instead of an error.
#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub async fn get_run_envelope(
    db: State<'_, DbState>,
    run_id: String,
) -> Result<Option<AgentRunEnvelope>, AppError> {
    get_run_envelope_impl(db.inner(), run_id).await
}

#[cfg(debug_assertions)]
pub(crate) async fn get_run_envelope_impl(
    db: &DbState,
    run_id: String,
) -> Result<Option<AgentRunEnvelope>, AppError> {
    let conn = db.lock();
    match agent_run_envelopes::get_by_run(&conn, &run_id) {
        Ok(env) => Ok(Some(env)),
        Err(AppError::NotFound(_)) => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_workspace_diff(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    get_workspace_diff_impl(db.inner(), workspace_id).await
}

pub(crate) async fn get_workspace_diff_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    let conn = db.lock();
    workspace_changes::latest_for_workspace(&conn, &workspace_id)
}

//
// Powers the +N/-N chip on every workspace row in the sidebar. Sums
// line counts from the same two numstat passes the file tree uses
// (committed range vs. base + working tree). Per-workspace git
// invocations are run concurrently via `tokio::spawn`. Best-effort —
// a failing workspace yields zeros instead of erroring the whole call.

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct WorkspaceDiffStats {
    pub workspace_id: String,
    pub added: i64,
    pub removed: i64,
}

#[tauri::command]
#[specta::specta]
pub async fn list_workspace_diff_stats(
    db: State<'_, DbState>,
) -> Result<Vec<WorkspaceDiffStats>, AppError> {
    list_workspace_diff_stats_impl(db.inner()).await
}

pub(crate) async fn list_workspace_diff_stats_impl(
    db: &DbState,
) -> Result<Vec<WorkspaceDiffStats>, AppError> {
    let workspaces = {
        let conn = db.lock();
        workspaces::list_all(&conn)?
    };
    let mut joins = Vec::with_capacity(workspaces.len());
    for ws in workspaces {
        joins.push(tokio::spawn(async move {
            let (added, removed) =
                compute_aggregate_diff_stats(&ws.worktree_path, &ws.base_branch).await;
            WorkspaceDiffStats {
                workspace_id: ws.workspace_id,
                added,
                removed,
            }
        }));
    }
    let mut out = Vec::with_capacity(joins.len());
    for j in joins {
        match j.await {
            Ok(stats) => out.push(stats),
            Err(e) => log::warn!("list_workspace_diff_stats: join failed: {e}"),
        }
    }
    Ok(out)
}

async fn compute_aggregate_diff_stats(worktree_path: &str, base_branch: &str) -> (i64, i64) {
    use crate::sandbox::diff::parse_numstat_per_file;
    let worktree = std::path::Path::new(worktree_path);
    let mut added = 0i64;
    let mut removed = 0i64;

    let range = format!("{base_branch}...HEAD");
    if let Ok(out) =
        crate::sandbox::run_git_capture(worktree, &["diff", &range, "--numstat"]).await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            for (_, (a, d)) in parse_numstat_per_file(&s) {
                added += a;
                removed += d;
            }
        }
    }
    if let Ok(out) =
        crate::sandbox::run_git_capture(worktree, &["diff", "HEAD", "--numstat"]).await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            for (_, (a, d)) in parse_numstat_per_file(&s) {
                added += a;
                removed += d;
            }
        }
    }
    (added, removed)
}

/// "Undo the last agent run." Resets the worktree to the most-recent
/// `agent_runs.checkpoint_sha` for this workspace's thread. Only the
/// latest run's diff is reverted; earlier-run diffs that were never
/// committed upstream stay in the worktree. With no prior run that
/// captured a checkpoint, returns `AppError::Validation` (UI shows a
/// friendly "nothing to discard" toast). For the v0.1.0-beta.1 single-decision
/// flow (one run per archive/discard cycle) this matches the user's
/// mental model.
#[tauri::command]
#[specta::specta]
pub async fn discard_workspace_changes(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<(), AppError> {
    discard_workspace_changes_impl(db.inner(), workspace_id).await
}

pub(crate) async fn discard_workspace_changes_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, checkpoint_sha) = {
        let conn = db.lock();
        // Plan P0.2 — `git reset --hard` mutates the worktree; blocked
        // on frozen workspaces.
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
        let ws = workspaces::get(&conn, &workspace_id)?;
        let thread = threads::get_by_workspace(&conn, &workspace_id)?;
        let runs = agent_runs::list_by_thread(&conn, &thread.thread_id)?;
        let sha = runs
            .iter()
            .rev()
            .find_map(|r| r.checkpoint_sha.clone())
            .ok_or_else(|| {
                AppError::Validation("no checkpoint to discard to (no agent runs yet)".into())
            })?;
        (ws.worktree_path, sha)
    };
    sandbox::discard_changes_to(std::path::Path::new(&worktree_path), &checkpoint_sha).await
}

// ===========================================================================
// Chat surface (S4.A)
// Tab bar + persistent messages. The Angular ChatFacade owns optimistic
// store mutations; these commands persist and return the canonical row.
// ===========================================================================

#[tauri::command]
#[specta::specta]
pub async fn list_chats(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<Chat>, AppError> {
    list_chats_impl(db.inner(), workspace_id).await
}

pub(crate) async fn list_chats_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Vec<Chat>, AppError> {
    let conn = db.lock();
    chats::list_open_for_workspace(&conn, &workspace_id)
}

/// All open chats across every workspace, newest first. Backs the
/// Phase 1 sidebar "Chats" group.
#[tauri::command]
#[specta::specta]
pub async fn list_all_chats(db: State<'_, DbState>) -> Result<Vec<Chat>, AppError> {
    list_all_chats_impl(db.inner()).await
}

pub(crate) async fn list_all_chats_impl(db: &DbState) -> Result<Vec<Chat>, AppError> {
    let conn = db.lock();
    chats::list_all_open(&conn)
}

#[tauri::command]
#[specta::specta]
pub async fn create_chat(
    db: State<'_, DbState>,
    workspace_id: String,
    title: String,
    llm_id: Option<String>,
) -> Result<Chat, AppError> {
    create_chat_impl(db.inner(), workspace_id, title, llm_id).await
}

pub(crate) async fn create_chat_impl(
    db: &DbState,
    workspace_id: String,
    title: String,
    llm_id: Option<String>,
) -> Result<Chat, AppError> {
    // New-chat defaults come from the resolved settings (bundled
    // defaults ◀ global settings.json). An explicit `llm_id` from the
    // caller still wins over the settings default model.
    let defaults = crate::settings::resolve(None).agent;
    let c = Chat {
        chat_id: new_id(),
        workspace_id,
        title,
        llm_id: llm_id.or(defaults.model),
        mode: defaults.mode,
        effort: defaults.effort,
        last_read_message_id: None,
        closed_at: None,
        created_at: now_ms(),
    };
    let conn = db.lock();
    chats::create(&conn, &c)?;
    Ok(c)
}

const VALID_MODES: &[&str] = &["agent", "plan", "ask"];
const VALID_EFFORTS: &[&str] = &["low", "medium", "high", "xhigh", "max"];

#[tauri::command]
#[specta::specta]
pub async fn update_chat_mode(
    db: State<'_, DbState>,
    chat_id: String,
    mode: String,
) -> Result<(), AppError> {
    update_chat_mode_impl(db.inner(), chat_id, mode).await
}

pub(crate) async fn update_chat_mode_impl(
    db: &DbState,
    chat_id: String,
    mode: String,
) -> Result<(), AppError> {
    if !VALID_MODES.contains(&mode.as_str()) {
        return Err(AppError::Validation(format!(
            "mode must be one of agent|plan|ask, got `{mode}`"
        )));
    }
    let conn = db.lock();
    chats::set_mode(&conn, &chat_id, &mode)
}

#[tauri::command]
#[specta::specta]
pub async fn update_chat_effort(
    db: State<'_, DbState>,
    chat_id: String,
    effort: String,
) -> Result<(), AppError> {
    update_chat_effort_impl(db.inner(), chat_id, effort).await
}

pub(crate) async fn update_chat_effort_impl(
    db: &DbState,
    chat_id: String,
    effort: String,
) -> Result<(), AppError> {
    if !VALID_EFFORTS.contains(&effort.as_str()) {
        return Err(AppError::Validation(format!(
            "effort must be one of low|medium|high|xhigh|max, got `{effort}`"
        )));
    }
    let conn = db.lock();
    chats::set_effort(&conn, &chat_id, &effort)
}

#[tauri::command]
#[specta::specta]
pub async fn update_chat_model(
    db: State<'_, DbState>,
    chat_id: String,
    llm_id: String,
) -> Result<(), AppError> {
    update_chat_model_impl(db.inner(), chat_id, llm_id).await
}

pub(crate) async fn update_chat_model_impl(
    db: &DbState,
    chat_id: String,
    llm_id: String,
) -> Result<(), AppError> {
    if llm_id.trim().is_empty() {
        return Err(AppError::Validation("llm_id must not be empty".into()));
    }
    let conn = db.lock();
    chats::set_llm_id(&conn, &chat_id, &llm_id)
}

#[tauri::command]
#[specta::specta]
pub async fn mark_chat_read(
    db: State<'_, DbState>,
    chat_id: String,
    message_id: String,
) -> Result<(), AppError> {
    mark_chat_read_impl(db.inner(), chat_id, message_id).await
}

pub(crate) async fn mark_chat_read_impl(
    db: &DbState,
    chat_id: String,
    message_id: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    chats::mark_read(&conn, &chat_id, &message_id)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_chat(
    db: State<'_, DbState>,
    chat_id: String,
    title: String,
) -> Result<(), AppError> {
    rename_chat_impl(db.inner(), chat_id, title).await
}

pub(crate) async fn rename_chat_impl(
    db: &DbState,
    chat_id: String,
    title: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    chats::set_title(&conn, &chat_id, &title)
}

#[tauri::command]
#[specta::specta]
pub async fn close_chat(db: State<'_, DbState>, chat_id: String) -> Result<(), AppError> {
    close_chat_impl(db.inner(), chat_id).await
}

pub(crate) async fn close_chat_impl(db: &DbState, chat_id: String) -> Result<(), AppError> {
    let conn = db.lock();
    chats::close(&conn, &chat_id, now_ms())
}

#[tauri::command]
#[specta::specta]
pub async fn get_active_chat(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Option<String>, AppError> {
    get_active_chat_impl(db.inner(), workspace_id).await
}

pub(crate) async fn get_active_chat_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Option<String>, AppError> {
    let conn = db.lock();
    workspace_active_chat::get(&conn, &workspace_id)
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_chat(
    db: State<'_, DbState>,
    workspace_id: String,
    chat_id: String,
) -> Result<(), AppError> {
    set_active_chat_impl(db.inner(), workspace_id, chat_id).await
}

pub(crate) async fn set_active_chat_impl(
    db: &DbState,
    workspace_id: String,
    chat_id: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspace_active_chat::set(&conn, &workspace_id, &chat_id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_messages(
    db: State<'_, DbState>,
    chat_id: String,
) -> Result<Vec<Message>, AppError> {
    list_messages_impl(db.inner(), chat_id).await
}

pub(crate) async fn list_messages_impl(
    db: &DbState,
    chat_id: String,
) -> Result<Vec<Message>, AppError> {
    let conn = db.lock();
    messages::list_for_chat(&conn, &chat_id)
}

/// Inserts a message and returns the canonical row. Angular passes a
/// pre-generated `message_id` so optimistic UI can swap by ID without
/// a round-trip ambiguity.
#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn insert_message(
    db: State<'_, DbState>,
    message_id: String,
    chat_id: String,
    role: String,
    content: String,
    mode: Option<String>,
    status: String,
    run_id: Option<String>,
    timeline_json: Option<String>,
) -> Result<Message, AppError> {
    insert_message_impl(
        db.inner(),
        message_id,
        chat_id,
        role,
        content,
        mode,
        status,
        run_id,
        timeline_json,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn insert_message_impl(
    db: &DbState,
    message_id: String,
    chat_id: String,
    role: String,
    content: String,
    mode: Option<String>,
    status: String,
    run_id: Option<String>,
    timeline_json: Option<String>,
) -> Result<Message, AppError> {
    let msg = Message {
        message_id,
        chat_id,
        run_id,
        role,
        content,
        mode,
        status,
        timeline_json,
        created_at: now_ms(),
    };
    let conn = db.lock();
    messages::insert(&conn, &msg)?;
    Ok(msg)
}

#[tauri::command]
#[specta::specta]
pub async fn update_message_content(
    db: State<'_, DbState>,
    message_id: String,
    content: String,
) -> Result<(), AppError> {
    update_message_content_impl(db.inner(), message_id, content).await
}

pub(crate) async fn update_message_content_impl(
    db: &DbState,
    message_id: String,
    content: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    messages::update_content(&conn, &message_id, &content)
}

#[tauri::command]
#[specta::specta]
pub async fn update_message_status(
    db: State<'_, DbState>,
    message_id: String,
    status: String,
) -> Result<(), AppError> {
    update_message_status_impl(db.inner(), message_id, status).await
}

pub(crate) async fn update_message_status_impl(
    db: &DbState,
    message_id: String,
    status: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    messages::update_status(&conn, &message_id, &status)
}

/// Link an assistant message to its run id (known only after the run
/// starts). Persists `messages.run_id` so the dev-only debug inspector can
/// fetch the run's envelope from a message.
#[tauri::command]
#[specta::specta]
pub async fn update_message_run_id(
    db: State<'_, DbState>,
    message_id: String,
    run_id: String,
) -> Result<(), AppError> {
    update_message_run_id_impl(db.inner(), message_id, run_id).await
}

pub(crate) async fn update_message_run_id_impl(
    db: &DbState,
    message_id: String,
    run_id: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    messages::update_run_id(&conn, &message_id, &run_id)
}

#[tauri::command]
#[specta::specta]
pub async fn update_message_timeline(
    db: State<'_, DbState>,
    message_id: String,
    timeline_json: Option<String>,
) -> Result<(), AppError> {
    update_message_timeline_impl(db.inner(), message_id, timeline_json).await
}

pub(crate) async fn update_message_timeline_impl(
    db: &DbState,
    message_id: String,
    timeline_json: Option<String>,
) -> Result<(), AppError> {
    let conn = db.lock();
    messages::update_timeline(&conn, &message_id, timeline_json.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn check_claude_install() -> ClaudeInstall {
    install::check_installed().await
}

/// Step 6d — probe for an existing `claude` session by running
/// `claude auth status`. The frontend uses this to give Pro/Max users a
/// single-click "Connect" experience that bypasses the API-key dialog when
/// their CLI is already authenticated.
#[tauri::command]
#[specta::specta]
pub async fn check_claude_code_session() -> bool {
    session::has_session().await
}

/// Step 6 — cheap presence check used by the frontend on app start to know
/// whether to render "Not connected" immediately or to kick off a probe.
/// Never returns the value of the key.
#[tauri::command]
#[specta::specta]
pub async fn has_anthropic_key() -> Result<bool, AppError> {
    keyring_store::has_anthropic_key()
}

/// Step 6 — probe-then-persist. Only writes to the keyring when the probe
/// returns `Connected`. On `Invalid` / `NetworkError` the key is dropped at
/// the end of this function frame and never touches disk. The argument
/// `key` is the only place the value is ever passed by-value into Mozart
/// from the frontend.
#[tauri::command]
#[specta::specta]
pub async fn connect_anthropic(key: String) -> Result<ProbeResult, AppError> {
    let result = anthropic_probe::probe(&key).await;
    if matches!(result, ProbeResult::Connected) {
        keyring_store::set_anthropic_key(&key)?;
    }
    Ok(result)
}

/// Step 6 — idempotent removal of the stored key. Safe to call when no
/// entry exists.
#[tauri::command]
#[specta::specta]
pub async fn disconnect_anthropic() -> Result<(), AppError> {
    keyring_store::clear_anthropic_key()
}

/// Step 6 — re-probe the currently stored key. Returns `Validation` when no
/// key is stored (the frontend gates this call on `has_anthropic_key()` so
/// the error path is only hit on misuse).
#[tauri::command]
#[specta::specta]
pub async fn refresh_anthropic_connection() -> Result<ProbeResult, AppError> {
    match keyring_store::get_anthropic_key()? {
        Some(k) => Ok(anthropic_probe::probe(&k).await),
        None => Err(AppError::Validation("no stored anthropic key".into())),
    }
}

/// Keyless reachability check polled by the front-end ConnectivityService.
/// Owned by Rust so a non-200 HTTP response (e.g. 404 on `HEAD /`) does not
/// surface as a noisy "Failed to load resource" line in DevTools.
#[tauri::command]
#[specta::specta]
pub async fn probe_anthropic_reachability() -> bool {
    anthropic_probe::probe_reachability().await
}

// ── Codex / OpenAI provider ─────────────────────────────────────────────
// Parallels the Anthropic command set above so the onboarding provider step
// can offer Codex with the same shape: install probe, `codex login` session
// probe, and probe-then-persist for an OPENAI_API_KEY.

/// Probe for the `codex` CLI by running `codex --version`. Mirrors
/// [`check_claude_install`].
#[tauri::command]
#[specta::specta]
pub async fn check_codex_install() -> ClaudeInstall {
    install::check_codex_installed().await
}

/// Probe for an existing `codex` session by running `codex login status`.
/// Mirrors [`check_claude_code_session`].
#[tauri::command]
#[specta::specta]
pub async fn check_codex_session() -> bool {
    codex_session::has_session().await
}

/// Cheap presence check for a stored OpenAI key. Never returns the value.
#[tauri::command]
#[specta::specta]
pub async fn has_openai_key() -> Result<bool, AppError> {
    keyring_store::has_openai_key()
}

/// Probe-then-persist for an OpenAI key. Only writes to the keyring when the
/// probe returns `Connected`. Mirrors [`connect_anthropic`].
#[tauri::command]
#[specta::specta]
pub async fn connect_openai(key: String) -> Result<ProbeResult, AppError> {
    let result = openai_probe::probe(&key).await;
    if matches!(result, ProbeResult::Connected) {
        keyring_store::set_openai_key(&key)?;
    }
    Ok(result)
}

/// Idempotent removal of the stored OpenAI key.
#[tauri::command]
#[specta::specta]
pub async fn disconnect_openai() -> Result<(), AppError> {
    keyring_store::clear_openai_key()
}

/// Re-probe the currently stored OpenAI key. Returns `Validation` when no
/// key is stored (the frontend gates this on `has_openai_key()`).
#[tauri::command]
#[specta::specta]
pub async fn refresh_openai_connection() -> Result<ProbeResult, AppError> {
    match keyring_store::get_openai_key()? {
        Some(k) => Ok(openai_probe::probe(&k).await),
        None => Err(AppError::Validation("no stored openai key".into())),
    }
}

/// List the workspace's worktree contents as a nested file tree, with
/// per-file change badges (`A` / `M` / `D`) computed against the
/// workspace's `base_branch`.
///
/// `show_ignored=false` filters via `.gitignore` (ripgrep walker).
/// `show_ignored=true` walks everything except `.git/` and tags entries
/// with the `ignored` flag so the UI can mute them.
#[tauri::command]
#[specta::specta]
pub async fn list_repository_tree(
    db: State<'_, DbState>,
    cache: State<'_, std::sync::Arc<FileTreeCache>>,
    workspace_id: String,
    show_ignored: bool,
) -> Result<Vec<FileNodeDto>, AppError> {
    list_repository_tree_impl(db.inner(), cache.inner().as_ref(), workspace_id, show_ignored).await
}

pub(crate) async fn list_repository_tree_impl(
    db: &DbState,
    cache: &FileTreeCache,
    workspace_id: String,
    show_ignored: bool,
) -> Result<Vec<FileNodeDto>, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    // Capture *before* the cache lookup so a watcher event arriving
    // mid-rebuild gets detected by `store` and dropped silently.
    let captured = cache.current_revision(&workspace_id);
    if let Some(tree) = cache.get(&workspace_id, show_ignored, &ws.base_branch) {
        return Ok(tree);
    }
    let tree = file_tree::list_tree(
        std::path::Path::new(&ws.worktree_path),
        &ws.base_branch,
        show_ignored,
    )
    .await?;
    cache.store(
        &workspace_id,
        show_ignored,
        &ws.base_branch,
        tree.clone(),
        captured,
    );
    Ok(tree)
}

/// Subscribe to FS-change events for the workspace's worktree. Spawns
/// a `notify-debouncer-mini` watcher (200ms window) and registers it
/// keyed by `workspace_id` so a subsequent call for the same workspace
/// replaces the previous watcher.
#[tauri::command]
#[specta::specta]
pub async fn watch_repository_tree(
    db: State<'_, DbState>,
    registry: State<'_, FileWatcherRegistry>,
    cache: State<'_, std::sync::Arc<FileTreeCache>>,
    workspace_id: String,
    on_event: Channel<FileTreeEvent>,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    let debouncer = file_tree::spawn_watcher(
        std::path::PathBuf::from(&ws.worktree_path),
        workspace_id.clone(),
        std::sync::Arc::clone(cache.inner()),
        on_event,
    )?;
    registry.register(
        workspace_id,
        crate::file_watcher_registry::WatcherHandle::new(debouncer),
    );
    Ok(())
}

/// Cancel the active watcher for `workspace_id`, if any. No-op if the
/// workspace has no active watcher.
#[tauri::command]
#[specta::specta]
pub async fn unwatch_repository_tree(
    registry: State<'_, FileWatcherRegistry>,
    workspace_id: String,
) -> Result<(), AppError> {
    registry.cancel(&workspace_id);
    Ok(())
}

/// Resolve the unified diff text for one file in a workspace, against
/// the workspace's `base_branch`. Working tree (incl. staged + unstaged)
/// vs. base. Untracked files surface as a synthesized "all-added" diff;
/// unchanged files return an empty string (caller renders "No changes.").
#[tauri::command]
#[specta::specta]
pub async fn get_file_diff(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<String, AppError> {
    get_file_diff_impl(db.inner(), workspace_id, path).await
}

/// Read a file's raw contents from a workspace's worktree. Used by the
/// markdown preview, the CodeMirror Edit pane (P2.1) and any other
/// component that needs file content rather than a diff. Path validation
/// goes through `path_guard::guard_agent_relative_path` so the read,
/// save, diff, and staging paths all share the same sandbox check
/// and cannot drift.
#[tauri::command]
#[specta::specta]
pub async fn read_workspace_file(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<String, AppError> {
    // Pull the workspace's root path before letting tokio touch the FS.
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };

    // P0.1 S0.1.D — cheap v0 pre-check + canonicalize-and-confine
    // against the workspace's sandbox roots. The cheap step catches
    // obvious garbage; the canonical step closes the symlink-escape
    // bypass (a symlink inside the worktree pointing at `/etc/hosts`
    // would pass the regex but fail the prefix assertion).
    let abs = path_guard::guard_agent_relative_path(db.inner(), &ws, &path)?;

    let body = tokio::fs::read_to_string(&abs)
        .await
        .map_err(|e| AppError::Io(format!("read {abs:?}: {e}")))?;
    Ok(body)
}

/// Write a file in the workspace's worktree. Used by the CodeMirror Edit
/// pane (P2.1) for an explicit Save action.
///
/// Contract:
/// - `expected_hash` = sha256 of the buffer the editor last loaded /
///   saved. The command computes the current on-disk hash and rejects
///   with `AppError::StaleFile(path)` if they diverge — the file changed
///   under us, the editor must reload or discard.
/// - `AppError::Frozen` when the workspace is in the closed UI state
///   (`done` / `canceled`) — Save must be blocked, [§P0.2 freeze].
/// - UTF-8 text only. Binary / non-UTF-8 editing is out of scope for
///   P2.1.
/// - Atomic: writes to `<path>.mozart-tmp-<rand>` next to the target
///   and renames it into place so a torn write can never leave a half
///   file on disk.
#[tauri::command]
#[specta::specta]
pub async fn file_save(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
    content: String,
    expected_hash: String,
) -> Result<String, AppError> {
    file_save_impl(db.inner(), workspace_id, path, content, expected_hash).await
}

pub(crate) async fn file_save_impl(
    db: &DbState,
    workspace_id: String,
    path: String,
    content: String,
    expected_hash: String,
) -> Result<String, AppError> {
    // Pull workspace + freeze gate together. Done/canceled blocks the
    // mutation; the read path stays open.
    let ws = {
        let conn = db.lock();
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
        workspaces::get(&conn, &workspace_id)?
    };

    // P0.1 S0.1.D — guard handles cheap pre-check + canonicalize-and-
    // confine. The two-pass canonicalize inside `validate_agent_path`
    // accepts files-to-be-created (parent exists, target does not),
    // which is what file_save needs since the target may not exist
    // on first save.
    let abs = path_guard::guard_agent_relative_path(db, &ws, &path)?;

    // Stale check: compare expected (editor-side baseline) against the
    // current on-disk body. A missing file is treated as a divergence —
    // P2.1 only edits files that already exist on disk; callers that
    // want create-on-save semantics would have to opt in explicitly.
    let on_disk = match tokio::fs::read(&abs).await {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(AppError::Io(format!("read {abs:?}: {e}"))),
    };

    let current_hash = match &on_disk {
        Some(bytes) => sha256_hex(bytes),
        None => sha256_hex(b""),
    };
    if current_hash != expected_hash {
        return Err(AppError::StaleFile(path));
    }

    // Atomic write: tmp file in the same directory, then rename. Same
    // directory keeps the rename single-fs and atomic on POSIX. We use
    // a uuid-tagged suffix so two saves in flight never clobber each
    // other's tmp file.
    let parent = abs.parent().ok_or_else(|| {
        AppError::Validation(format!("path has no parent: {path}"))
    })?;
    let file_name = abs
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Validation(format!("non-utf8 path: {path}")))?;
    let tmp_name = format!(".{}.mozart-tmp-{}", file_name, uuid::Uuid::new_v4());
    let tmp_path = parent.join(&tmp_name);

    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|e| AppError::Io(format!("mkdir {parent:?}: {e}")))?;
    tokio::fs::write(&tmp_path, content.as_bytes())
        .await
        .map_err(|e| AppError::Io(format!("write {tmp_path:?}: {e}")))?;
    if let Err(e) = tokio::fs::rename(&tmp_path, &abs).await {
        // Best-effort cleanup; if the rename failed the tmp is the
        // dangling artifact.
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err(AppError::Io(format!("rename {tmp_path:?} -> {abs:?}: {e}")));
    }

    Ok(sha256_hex(content.as_bytes()))
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    let out = h.finalize();
    let mut s = String::with_capacity(out.len() * 2);
    for b in out.iter() {
        use std::fmt::Write;
        let _ = write!(&mut s, "{b:02x}");
    }
    s
}

/// Truncated content hash used by the Viewed state. 16 hex chars =
/// 64 bits of entropy — collision-resistant enough to distinguish
/// "user-viewed" vs "agent-modified-since" within a single workspace's
/// file set.
pub(crate) fn short_content_hash(bytes: &[u8]) -> String {
    let mut full = sha256_hex(bytes);
    full.truncate(16);
    full
}

pub(crate) async fn get_file_diff_impl(
    db: &DbState,
    workspace_id: String,
    path: String,
) -> Result<String, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };

    // P0.1 S0.1.D — `file_diff::get_file_diff` doesn't itself touch
    // the FS at the path arg (it shells git), but git's `--`
    // separator does NOT block path traversal if the path resolves
    // through a symlink. Gate so the diff surface honors the same
    // sandbox as read/save.
    path_guard::guard_agent_relative_path(db, &ws, &path)?;

    file_diff::get_file_diff(
        std::path::Path::new(&ws.worktree_path),
        &ws.base_branch,
        &path,
    )
    .await
}

/// Open (or replace) the PTY for a workspace, rooted at its worktree.
/// Streams `TerminalEvent` chunks through `on_event`. Replacement
/// semantics: any prior PTY for the same workspace is killed before
/// the new one spawns. The Angular `TerminalRegistry` guarantees one
/// call per workspace per app session in normal flow; the replacement
/// path is a safety net for hot-reload + error recovery.
#[tauri::command]
#[specta::specta]
pub async fn open_terminal(
    db: State<'_, DbState>,
    registry: State<'_, TerminalRegistry>,
    workspace_id: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };

    // Atom 6 (user-added) — refuse to open a PTY whose initial cwd
    // is outside the workspace's sandbox roots (defensive against a
    // corrupted DB row pointing at /etc). The OS-level fence
    // (TODO-001 / TODOS.md "real OS-level filesystem fence") is
    // still the only thing that prevents `cd ~/.ssh` after the
    // shell is live.
    path_guard::guard_workspace_worktree(db.inner(), &ws)?;

    // Drop any prior PTY before spawning a new one (kills child).
    registry.cancel(&workspace_id);
    let handle = terminal::spawn(
        std::path::Path::new(&ws.worktree_path),
        cols.max(1),
        rows.max(1),
        on_event,
    )?;
    registry.register(workspace_id, Arc::new(handle));
    Ok(())
}

/// Forward bytes (typed by the user via xterm.js) to the PTY's stdin.
/// Plan P0.2 — refuses on frozen workspaces. The xterm frontend also
/// sets `disableStdin = true` when frozen, so this should rarely fire;
/// the guard is defense-in-depth for any caller bypassing the UI.
#[tauri::command]
#[specta::specta]
pub async fn write_terminal(
    db: State<'_, DbState>,
    registry: State<'_, TerminalRegistry>,
    workspace_id: String,
    data: String,
) -> Result<(), AppError> {
    write_terminal_impl(db.inner(), registry.inner(), workspace_id, data).await
}

pub(crate) async fn write_terminal_impl(
    db: &DbState,
    registry: &TerminalRegistry,
    workspace_id: String,
    data: String,
) -> Result<(), AppError> {
    // The onboarding login PTY is registered under a synthetic id with no
    // workspace row; the frozen-workspace guard doesn't apply to it.
    if workspace_id != ONBOARDING_PTY_ID {
        let conn = db.lock();
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
    }
    let handle = registry
        .get(&workspace_id)
        .ok_or_else(|| AppError::NotFound(format!("no terminal for workspace {workspace_id}")))?;
    handle.write(data.as_bytes())
}

/// Resize the PTY to match xterm.js' viewport. Called on container
/// resize (debounced front-end side).
#[tauri::command]
#[specta::specta]
pub async fn resize_terminal(
    registry: State<'_, TerminalRegistry>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    let handle = registry
        .get(&workspace_id)
        .ok_or_else(|| AppError::NotFound(format!("no terminal for workspace {workspace_id}")))?;
    handle.resize(cols.max(1), rows.max(1))
}

/// Close the PTY (kill the child + drop the master). No-op if no PTY
/// is registered for the workspace.
#[tauri::command]
#[specta::specta]
pub async fn close_terminal(
    registry: State<'_, TerminalRegistry>,
    workspace_id: String,
) -> Result<(), AppError> {
    registry.cancel(&workspace_id);
    Ok(())
}

/// Update the project's `run_command`. Pass `None` to clear it.
#[tauri::command]
#[specta::specta]
pub async fn set_repo_run_command(
    db: State<'_, DbState>,
    repo_id: String,
    command: Option<String>,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_run_command(&conn, &repo_id, command.as_deref())
}

/// Update the project's `setup_command`. Pass `None` to clear it.
/// Setup command is the "install / prepare" half of the per-project
/// runner pair (e.g. `pnpm install`). Mirrors `set_repo_run_command`.
#[tauri::command]
#[specta::specta]
pub async fn set_repo_setup_command(
    db: State<'_, DbState>,
    repo_id: String,
    command: Option<String>,
) -> Result<(), AppError> {
    let conn = db.lock();
    repos::set_setup_command(&conn, &repo_id, command.as_deref())
}

/// Effective run/setup commands for a project, resolved from the repo's
/// committed `.mozart/settings.json` `scripts` (layered) with the DB
/// columns as fallback. Either field is `None` when no source supplies a
/// non-empty command. Powers the frontend Run/Setup CTAs.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub struct ResolvedCommands {
    pub run: Option<String>,
    pub setup: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_workspace_commands(
    db: State<'_, DbState>,
    repo_id: String,
) -> Result<ResolvedCommands, AppError> {
    let repo = {
        let conn = db.lock();
        repos::get(&conn, &repo_id)?
    };
    Ok(ResolvedCommands {
        run: resolve_repo_command(&repo, WorkspaceCommandKind::Run).ok(),
        setup: resolve_repo_command(&repo, WorkspaceCommandKind::Setup).ok(),
    })
}

/// Which half of the project's runner pair to launch: the setup
/// command (e.g. `pnpm install`) or the run command (e.g. `pnpm dev`).
/// The repo's committed `.mozart/settings.json` `scripts` take precedence
/// over the DB column for the corresponding script; the DB column is the
/// fallback.
#[derive(Copy, Clone)]
enum WorkspaceCommandKind {
    Run,
    Setup,
}

impl WorkspaceCommandKind {
    fn script_key(self) -> &'static str {
        match self {
            Self::Run => "run",
            Self::Setup => "setup",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Run => "run",
            Self::Setup => "setup",
        }
    }
}

/// Resolve the effective command for `(repo, kind)`. Checks the repo's
/// committed `.mozart/settings.json` `scripts.<kind>` first (via the
/// layered settings resolver), falling back to the matching DB column.
/// Returns a `Validation` error when neither source has a non-empty command.
fn resolve_repo_command(
    repo: &crate::db::models::Repo,
    kind: WorkspaceCommandKind,
) -> Result<String, AppError> {
    let key = kind.script_key();
    let from_settings = crate::settings::resolve(Some(std::path::Path::new(&repo.path)))
        .scripts
        .into_iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v)
        .filter(|s| !s.trim().is_empty());
    if let Some(cmd) = from_settings {
        return Ok(cmd);
    }
    let from_db = match kind {
        WorkspaceCommandKind::Run => repo.run_command.clone(),
        WorkspaceCommandKind::Setup => repo.setup_command.clone(),
    };
    from_db
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            AppError::Validation(format!(
                "no {} command configured for this project",
                kind.label()
            ))
        })
}

/// Spawn the project's `run_command` in a PTY rooted at the workspace's
/// worktree. Streams output through `on_event`. Replaces any prior run
/// PTY for the same workspace (the previous run is killed). Returns
/// `Validation` if neither `.mozart/settings.json` `scripts.run` nor
/// `repos.run_command` is set.
#[tauri::command]
#[specta::specta]
pub async fn start_workspace_run(
    db: State<'_, DbState>,
    registry: State<'_, WorkspaceRunRegistry>,
    workspace_id: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(), AppError> {
    start_workspace_command_impl(
        db.inner(),
        registry.inner(),
        workspace_id,
        cols,
        rows,
        on_event,
        WorkspaceCommandKind::Run,
    )
    .await
}

/// Spawn the project's `setup_command` (install / prepare) in a PTY
/// rooted at the workspace's worktree. Same lifecycle as
/// `start_workspace_run` — replaces any prior PTY for the workspace.
/// Reads `.mozart/run.json scripts.setup` with `repos.setup_command`
/// as a fallback.
#[tauri::command]
#[specta::specta]
pub async fn start_workspace_setup(
    db: State<'_, DbState>,
    registry: State<'_, WorkspaceRunRegistry>,
    workspace_id: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<(), AppError> {
    start_workspace_command_impl(
        db.inner(),
        registry.inner(),
        workspace_id,
        cols,
        rows,
        on_event,
        WorkspaceCommandKind::Setup,
    )
    .await
}


async fn start_workspace_command_impl(
    db: &DbState,
    registry: &WorkspaceRunRegistry,
    workspace_id: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
    kind: WorkspaceCommandKind,
) -> Result<(), AppError> {
    let (ws, command) = {
        let conn = db.lock();
        // Plan P0.2 — block run-script launches on frozen workspaces.
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
        let ws = workspaces::get(&conn, &workspace_id)?;
        let task = tasks::get(&conn, &ws.task_id)?;
        let repo = repos::get(&conn, &task.repo_id)?;
        let cmd = resolve_repo_command(&repo, kind)?;
        (ws, cmd)
    };

    // Atom 6 (user-added) — same PTY sandbox-root assertion as
    // `open_terminal`. The Run-tab PTY also inherits the user's
    // shell environment but starts at the workspace worktree.
    path_guard::guard_workspace_worktree(db, &ws)?;

    let worktree_path = ws.worktree_path;
    registry.cancel(&workspace_id);
    let handle = terminal::spawn_command(
        std::path::Path::new(&worktree_path),
        cols.max(1),
        rows.max(1),
        command,
        on_event,
    )?;
    registry.register(workspace_id, Arc::new(handle));
    Ok(())
}

/// Stop the workspace's run (kill the child, drop the PTY).
#[tauri::command]
#[specta::specta]
pub async fn stop_workspace_run(
    registry: State<'_, WorkspaceRunRegistry>,
    workspace_id: String,
) -> Result<(), AppError> {
    registry.cancel(&workspace_id);
    Ok(())
}

/// Probe `$PATH` for known IDE binaries. The list is ordered as in
/// `KNOWN_IDES`. Front-end uses this to filter the static
/// `OPEN_IN_TOOLS` array.
#[tauri::command]
#[specta::specta]
pub async fn detect_installed_ides() -> Result<Vec<DetectedIde>, AppError> {
    Ok(ide_launch::detect_installed_ides())
}

/// Launch `id` (e.g. `"vscode"`, `"cursor"`, `"finder"`) against the
/// workspace's worktree. The path is resolved server-side from the
/// workspace_id; the front-end never sees it.
#[tauri::command]
#[specta::specta]
pub async fn open_in_ide(
    db: State<'_, DbState>,
    workspace_id: String,
    ide_id: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    ide_launch::open_in_ide(&ide_id, std::path::Path::new(&ws.worktree_path))
}

/// Open `path` in the OS file manager (Finder / Explorer / the default
/// xdg file manager). Backs the source-repo crumb's "Open local folder"
/// action. Fire-and-forget — some managers (`explorer`) exit non-zero
/// even on success, so we only check that the spawn succeeded.
#[tauri::command]
#[specta::specta]
pub async fn open_path_in_file_manager(path: String) -> Result<(), AppError> {
    if !std::path::Path::new(&path).exists() {
        return Err(AppError::NotFound(format!("path not found: {path}")));
    }
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    crate::platform::spawn_background(program, &[std::ffi::OsStr::new(&path)], None)
}

/// Flat list of changed files in the workspace's worktree. Powers the
/// commit dialog's checkbox list.
#[tauri::command]
#[specta::specta]
pub async fn list_changed_files(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<ChangedFile>, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    commit::list_changed_files(std::path::Path::new(&ws.worktree_path)).await
}

/// All files changed on the workspace branch vs its base branch, including
/// committed changes. Powers the Changes tab in the right aside.
#[tauri::command]
#[specta::specta]
pub async fn list_branch_diff_files(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<ChangedFile>, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    commit::list_branch_diff_files(
        std::path::Path::new(&ws.worktree_path),
        &ws.base_branch,
    )
    .await
}

/// Files committed on the workspace branch since it diverged from its base
/// branch (`base...HEAD`). Working-tree edits are excluded. Powers the
/// "Committed" section of the Changes tab in the right aside.
#[tauri::command]
#[specta::specta]
pub async fn list_committed_files(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<ChangedFile>, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    commit::list_committed_files(
        std::path::Path::new(&ws.worktree_path),
        &ws.base_branch,
    )
    .await
}

/// Stage `paths` and create a commit with `message`. Returns the new
/// commit's sha. Refuses on empty path list / empty message.
#[tauri::command]
#[specta::specta]
pub async fn commit_workspace(
    db: State<'_, DbState>,
    workspace_id: String,
    paths: Vec<String>,
    message: String,
) -> Result<String, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    commit::commit(
        std::path::Path::new(&ws.worktree_path),
        &paths,
        &message,
    )
    .await
}

/// `git add -- <path>` inside the workspace's worktree. P0.1 S0.1.D —
/// gated by `path_guard::guard_agent_relative_path` so a symlink-escape
/// commit can't slip through staging.
#[tauri::command]
#[specta::specta]
pub async fn stage_file(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    path_guard::guard_agent_relative_path(db.inner(), &ws, &path)?;
    staging::stage(std::path::Path::new(&ws.worktree_path), &path).await
}

/// `git reset HEAD -- <path>` inside the workspace's worktree. Leaves
/// the working-tree copy untouched. P0.1 S0.1.D — same gate as
/// `stage_file`.
#[tauri::command]
#[specta::specta]
pub async fn unstage_file(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    path_guard::guard_agent_relative_path(db.inner(), &ws, &path)?;
    staging::unstage(std::path::Path::new(&ws.worktree_path), &path).await
}

/// `true` when the path has changes in the git index (X byte of
/// porcelain status is non-space, non-`?`). P0.1 S0.1.D — same gate.
#[tauri::command]
#[specta::specta]
pub async fn is_staged(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<bool, AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    path_guard::guard_agent_relative_path(db.inner(), &ws, &path)?;
    staging::is_staged(std::path::Path::new(&ws.worktree_path), &path).await
}

/// State of a single file relative to its stored Viewed mark. The
/// frontend uses this to decorate Changes-tab rows and to drive the
/// `mz-review-progress` summary. `not_viewed` is implicit (no row in
/// the table) and never returned by this surface — the Changes-tab
/// renderer defaults to `not_viewed` for any file without a status
/// entry here.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileViewState {
    Viewed,
    ChangedSinceViewed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct FileViewStatus {
    pub path: String,
    pub state: FileViewState,
    pub viewed_at: i64,
}

/// Compute the truncated content hash of a workspace-relative file
/// inside `worktree`. Missing files hash as the empty body so a
/// deleted-since-viewed file lands in `changed_since_viewed`.
async fn hash_workspace_file(worktree: &std::path::Path, path: &str) -> String {
    let abs = worktree.join(path);
    match tokio::fs::read(&abs).await {
        Ok(bytes) => short_content_hash(&bytes),
        Err(_) => short_content_hash(b""),
    }
}

/// Mark a file viewed. Explicit reviewer action only — opening a file
/// never calls this. Idempotent: re-marking refreshes `viewed_at` and
/// `viewed_at_hash` to the current on-disk hash, clearing any
/// `changed_since_viewed` state.
#[tauri::command]
#[specta::specta]
pub async fn mark_file_viewed(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    mark_file_viewed_impl(db.inner(), workspace_id, path).await
}

pub(crate) async fn mark_file_viewed_impl(
    db: &DbState,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    // P0.1 S0.1.D — `hash_workspace_file` below follows symlinks via
    // tokio::fs::read; without this gate a symlink could pin the
    // Viewed marker to a file outside the sandbox.
    path_guard::guard_agent_relative_path(db, &ws, &path)?;
    let hash = hash_workspace_file(std::path::Path::new(&ws.worktree_path), &path).await;
    let row = WorkspaceFileView {
        workspace_id,
        path,
        viewed_at: now_ms(),
        viewed_at_hash: hash,
    };
    let conn = db.lock();
    workspace_file_views::upsert(&conn, &row)
}

/// Drop the Viewed mark for a single file. Used by the discard flow
/// and by an explicit "Mark unviewed" toolbar action. No-op when the
/// file was never viewed.
#[tauri::command]
#[specta::specta]
pub async fn clear_file_view(
    db: State<'_, DbState>,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    clear_file_view_impl(db.inner(), workspace_id, path).await
}

pub(crate) async fn clear_file_view_impl(
    db: &DbState,
    workspace_id: String,
    path: String,
) -> Result<(), AppError> {
    validate_workspace_relative_path(&path)?;
    let conn = db.lock();
    workspace_file_views::delete(&conn, &workspace_id, &path)
}

/// Return the per-file Viewed status for every file that currently
/// has a stored mark in this workspace. Each entry is either
/// `viewed` (stored hash matches current on-disk hash) or
/// `changed_since_viewed` (mismatch — agent or user edit since the
/// mark). The frontend overlays this on its own changed-files list to
/// derive the four-way `not_viewed | viewed | changed_since_viewed |
/// staged` decoration described in `[[mozart-viewed-principle]]`.
#[tauri::command]
#[specta::specta]
pub async fn list_file_views(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<FileViewStatus>, AppError> {
    list_file_views_impl(db.inner(), workspace_id).await
}

pub(crate) async fn list_file_views_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<Vec<FileViewStatus>, AppError> {
    let (ws, rows) = {
        let conn = db.lock();
        let ws = workspaces::get(&conn, &workspace_id)?;
        let rows = workspace_file_views::list_for_workspace(&conn, &workspace_id)?;
        (ws, rows)
    };
    let worktree = std::path::PathBuf::from(&ws.worktree_path);
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let current = hash_workspace_file(&worktree, &r.path).await;
        let state = if current == r.viewed_at_hash {
            FileViewState::Viewed
        } else {
            FileViewState::ChangedSinceViewed
        };
        out.push(FileViewStatus {
            path: r.path,
            state,
            viewed_at: r.viewed_at,
        });
    }
    Ok(out)
}

/// Bulk "Mark all viewed" — marks every currently changed file viewed
/// with its current on-disk hash. Used by the dense Changes-tab summary
/// to close out a review in one click. Re-running the agent and
/// modifying any of these files flips them back to
/// `changed_since_viewed` via the normal hash comparison in
/// `list_file_views`.
#[tauri::command]
#[specta::specta]
pub async fn mark_all_viewed(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<(), AppError> {
    mark_all_viewed_impl(db.inner(), workspace_id).await
}

pub(crate) async fn mark_all_viewed_impl(
    db: &DbState,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    let worktree = std::path::PathBuf::from(&ws.worktree_path);
    let changed = commit::list_changed_files(&worktree).await?;
    if changed.is_empty() {
        return Ok(());
    }
    let now = now_ms();
    let mut rows = Vec::with_capacity(changed.len());
    for f in changed {
        let hash = hash_workspace_file(&worktree, &f.path).await;
        rows.push(WorkspaceFileView {
            workspace_id: workspace_id.clone(),
            path: f.path,
            viewed_at: now,
            viewed_at_hash: hash,
        });
    }
    let conn = db.lock();
    for row in &rows {
        workspace_file_views::upsert(&conn, row)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn has_github_token() -> Result<bool, AppError> {
    keyring_store::has_github_token()
}

/// Provenance of the currently-stored GitHub token. Exposed to the UI
/// so settings + PR dialog can render "via OAuth" vs "via PAT". Returns
/// `null` if no token is stored or if the keyring lost the sibling kind
/// entry (legacy data from before the provenance slot existed — treated
/// as PAT below).
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum GithubTokenKindDto {
    Pat,
    OauthClerk,
}

impl From<GithubTokenKind> for GithubTokenKindDto {
    fn from(k: GithubTokenKind) -> Self {
        match k {
            GithubTokenKind::Pat => GithubTokenKindDto::Pat,
            GithubTokenKind::OauthClerk => GithubTokenKindDto::OauthClerk,
        }
    }
}

/// Probe the token via `GET /user`; on success store it in the
/// keyring (marked as a PAT) and return the resolved login. Failure
/// leaves the keyring untouched.
#[tauri::command]
#[specta::specta]
pub async fn connect_github(token: String) -> Result<GithubProbeResult, AppError> {
    let probe = github::probe_token(&token).await;
    if matches!(probe, GithubProbeResult::Ok { .. }) {
        keyring_store::set_github_token(&token, GithubTokenKind::Pat)?;
    }
    Ok(probe)
}

/// Fetch the user's GitHub OAuth access token from `{WEB_BASE_URL}/api/github/oauth-token`
/// (which calls Clerk's Backend SDK with our Mozart-side secret key)
/// using the Clerk session JWT already stored on the desktop. The token
/// is probed via `GET /user` for defense-in-depth, then persisted in
/// the keyring marked with `GithubTokenKind::OauthClerk`.
///
/// Reshapes the backend's discriminated union into the existing
/// `GithubProbeResult` so the TS facade can treat OAuth-acquired and
/// PAT-acquired connects through one code path.
#[tauri::command]
#[specta::specta]
pub async fn connect_github_via_clerk() -> Result<GithubProbeResult, AppError> {
    let session = auth_store::load_session()?
        .ok_or_else(|| AppError::Validation("no Mozart session — sign in first".into()))?;
    match github::fetch_clerk_github_token(&session.token).await {
        github::ClerkGithubTokenResult::Ok { token, login } => {
            // Defense in depth: confirm the token actually works against
            // api.github.com before we persist it. Surfaces a clear
            // GithubProbeResult variant if Clerk handed us something stale.
            let probe = github::probe_token(&token).await;
            if matches!(probe, GithubProbeResult::Ok { .. }) {
                keyring_store::set_github_token(&token, GithubTokenKind::OauthClerk)?;
                // Prefer the login returned by Clerk (avoids an extra round-trip)
                // if the probe didn't surface one for some reason; in practice
                // `probe_token` always carries the login on Ok.
                if let GithubProbeResult::Ok { login: probe_login } = &probe {
                    return Ok(GithubProbeResult::Ok {
                        login: probe_login.clone(),
                    });
                }
                if let Some(l) = login {
                    return Ok(GithubProbeResult::Ok { login: l });
                }
            }
            Ok(probe)
        }
        github::ClerkGithubTokenResult::NotLinked => Err(AppError::Validation(
            "no GitHub account linked to your Clerk profile".into(),
        )),
        github::ClerkGithubTokenResult::Unauthorized => Ok(GithubProbeResult::Unauthorized),
        github::ClerkGithubTokenResult::ServerError { message } => {
            Ok(GithubProbeResult::Network { message })
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_github_token_kind() -> Result<Option<GithubTokenKindDto>, AppError> {
    Ok(keyring_store::get_github_token_kind()?.map(GithubTokenKindDto::from))
}

/// List up to 100 GitHub repos visible to the connected GitHub
/// account, sorted by recent activity. Used by the clone-repo dialog
/// to render an autocomplete list.
///
/// Resolution order:
///   1. If a token is stored in the keyring (PAT or Clerk-issued
///      OAuth), hit `api.github.com/user/repos` directly. Works for
///      both PAT-only users AND OAuth-Clerk users.
///   2. Otherwise fall back to the Mozart web backend's Clerk path
///      (`{WEB_BASE_URL}/api/github/repos`) which uses the Clerk
///      session JWT — covers the case where the user is signed into
///      Mozart and has linked GitHub via Clerk OAuth but no token
///      ever landed in the local keyring.
///   3. If neither path is available, return a clear Validation
///      error so the UI can prompt the user to connect.
#[tauri::command]
#[specta::specta]
pub async fn list_clerk_github_repos() -> Result<Vec<github::ClerkGithubRepo>, AppError> {
    if let Some(token) = keyring_store::get_github_token()? {
        match github::fetch_user_repos_with_token(&token).await {
            github::ClerkGithubReposResult::Ok { repos } => return Ok(repos),
            github::ClerkGithubReposResult::Unauthorized => {
                // Fall through to the Clerk path — the stored token
                // may be a stale OAuth token Clerk can refresh.
            }
            github::ClerkGithubReposResult::NotLinked => {
                return Err(AppError::Validation(
                    "no GitHub account linked".into(),
                ));
            }
            github::ClerkGithubReposResult::ServerError { message } => {
                return Err(AppError::Io(format!("github repos: {message}")));
            }
        }
    }
    let Some(session) = auth_store::load_session()? else {
        return Err(AppError::Validation(
            "GitHub not connected — connect via Settings".into(),
        ));
    };
    match github::fetch_clerk_github_repos(&session.token).await {
        github::ClerkGithubReposResult::Ok { repos } => Ok(repos),
        github::ClerkGithubReposResult::NotLinked => Err(AppError::Validation(
            "no GitHub account linked to your Clerk profile".into(),
        )),
        github::ClerkGithubReposResult::Unauthorized => {
            Err(AppError::Validation("github oauth unauthorized".into()))
        }
        github::ClerkGithubReposResult::ServerError { message } => {
            Err(AppError::Io(format!("github repos: {message}")))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn disconnect_github() -> Result<(), AppError> {
    keyring_store::clear_github_token()
}

/// P1.1 D9 — detect the project's GitHub remote for PR creation. Used
/// by the right-aside merge menu (gating) and the create-PR dialog
/// (precise messaging). Enumerates every configured git remote,
/// prefers `origin`, then any github.com remote. The check is
/// project-level (not workspace-level) because git remotes are shared
/// across all worktrees of the same repo.
///
/// Returns a typed `GithubRemoteStatus` so the UI can tell "no remote",
/// "non-GitHub remote", and "couldn't read remotes" apart — the old
/// bare-bool collapsed all three into a misleading "GitHub not found".
#[tauri::command]
#[specta::specta]
pub async fn detect_github_remote_for_project(
    db: State<'_, DbState>,
    repo_id: String,
) -> Result<github::GithubRemoteStatus, AppError> {
    let repo = {
        let conn = db.lock();
        repos::get(&conn, &repo_id)?
    };
    Ok(detect_github_remote_at(std::path::Path::new(&repo.path)).await)
}

/// Shared remote classification for the project probe and PR creation.
/// Reads `git remote`, then `git remote get-url <name>` for each, and
/// hands the `(name, url)` pairs to [`github::classify_remotes`].
/// A failure to list remotes at all (git missing, not a repo) surfaces
/// as `DetectError` — never as a misleading "no remote".
async fn detect_github_remote_at(path: &std::path::Path) -> github::GithubRemoteStatus {
    let names_raw = match sandbox::run_git(path, &["remote"]).await {
        Ok(s) => s,
        Err(e) => return github::GithubRemoteStatus::DetectError { message: e.to_string() },
    };
    let mut remotes: Vec<(String, String)> = Vec::new();
    for name in names_raw.lines().map(str::trim).filter(|n| !n.is_empty()) {
        if let Ok(url) = sandbox::run_git(path, &["remote", "get-url", name]).await {
            let url = url.trim().to_string();
            if !url.is_empty() {
                remotes.push((name.to_string(), url));
            }
        }
    }
    github::classify_remotes(&remotes)
}

/// Push the workspace's branch to `origin` (with `-u`) using the local
/// git binary. Resolves the origin URL via `git remote get-url origin`.
/// Surfaces `Validation` if no `origin` is set.
#[tauri::command]
#[specta::specta]
pub async fn push_workspace_branch(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<(), AppError> {
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    let worktree = std::path::Path::new(&ws.worktree_path);
    // Validate `origin` exists; the actual push uses `-u origin <branch>`.
    let _origin = sandbox::run_git(worktree, &["remote", "get-url", "origin"])
        .await
        .map_err(|e| match e {
            AppError::GitCmd(_) => AppError::Validation(
                "this project has no `origin` remote configured".into(),
            ),
            other => other,
        })?;
    sandbox::run_git(
        worktree,
        &["push", "-u", "origin", &ws.branch_name],
    )
    .await?;
    Ok(())
}

/// Push the branch (idempotent) then create a PR via the GitHub REST
/// API and persist the result on the workspace. Requires a stored
/// GitHub token; the project must have a github.com remote (origin
/// preferred, else any GitHub remote — see [`detect_github_remote_at`]).
/// Pushes to the detected remote (not a hardcoded `origin`).
///
/// On success, `pr_url` / `pr_number` / `pr_state` are written to the
/// workspace row so "Open in GitHub" and the workspace's PR status
/// survive a dialog close / app restart.
///
/// Self-healing: when the stored token is an OAuth token acquired via
/// Clerk (`GithubTokenKind::OauthClerk`) and GitHub answers 401, the
/// command transparently re-fetches a fresh token from `{WEB_BASE_URL}
/// /api/github/oauth-token` (Clerk Backend SDK refreshes upstream),
/// overwrites the keyring, and retries once. PAT tokens are never
/// refreshed — a 401 there surfaces directly to the dialog.
#[tauri::command]
#[specta::specta]
pub async fn create_workspace_pr(
    db: State<'_, DbState>,
    workspace_id: String,
    title: String,
    body: String,
    draft: bool,
) -> Result<CreatedPr, AppError> {
    let token = keyring_store::get_github_token()?
        .ok_or_else(|| AppError::Validation("no GitHub token stored".into()))?;
    let ws = {
        let conn = db.lock();
        workspaces::get(&conn, &workspace_id)?
    };
    let worktree = std::path::Path::new(&ws.worktree_path);
    let (owner, repo) = match detect_github_remote_at(worktree).await {
        github::GithubRemoteStatus::GithubRemote { owner, repo, .. } => (owner, repo),
        github::GithubRemoteStatus::NonGithubRemote { url, .. } => {
            return Err(AppError::Validation(format!(
                "PR creation currently requires a GitHub remote — this project's remote is {url}"
            )));
        }
        github::GithubRemoteStatus::NoRemote => {
            return Err(AppError::Validation(
                "the source repository has no git remote configured — add a GitHub remote to open a PR".into(),
            ));
        }
        github::GithubRemoteStatus::DetectError { message } => {
            return Err(AppError::Validation(format!(
                "could not read the project's git remotes: {message}"
            )));
        }
    };
    // Push via HTTPS with the stored token so the same credentials are
    // used for both the push and the subsequent API call, regardless of
    // how the repo was originally cloned (SSH, plain HTTPS, etc.).
    //
    // `head` is the PR's source ref. It defaults to a same-repo branch;
    // when the account lacks push access we transparently fork into the
    // user's account, push there, and open a cross-fork PR
    // (`head = "fork_owner:branch"`).
    let push_url = format!("https://x-access-token:{token}@github.com/{owner}/{repo}.git");
    let mut head = ws.branch_name.clone();
    if let Err(e) = sandbox::run_git(worktree, &["push", &push_url, &ws.branch_name]).await {
        // A push to a repo the account can't write to comes back as a
        // 403 / "Permission … denied". Rather than dead-end the user,
        // fork the repo and push the branch to the fork instead.
        let denied = matches!(
            &e,
            AppError::GitCmd(msg)
                if msg.contains("denied")
                    || msg.contains("403")
                    || msg.contains("not have permission")
        );
        if !denied {
            return Err(e);
        }
        let fork_owner = github::fork_repo(&token, &owner, &repo).await?;
        // GitHub returns the repo itself when you "fork" your own repo, so
        // fork_owner == owner. Pushing to the same URL would fail again.
        if fork_owner == owner {
            return Err(AppError::Validation(format!(
                "Cannot push to {owner}/{repo} — your GitHub token lacks write access \
                 to this repository. Ensure it has the 'public_repo' (or 'repo' for \
                 private repos) scope. Reconnect GitHub in Settings to update your permissions."
            )));
        }
        let fork_push_url =
            format!("https://x-access-token:{token}@github.com/{fork_owner}/{repo}.git");
        sandbox::run_git(worktree, &["push", &fork_push_url, &ws.branch_name]).await?;
        head = format!("{fork_owner}:{}", ws.branch_name);
    }
    let first_attempt = github::create_pr(
        &token,
        &owner,
        &repo,
        &head,
        &ws.base_branch,
        &title,
        &body,
        draft,
    )
    .await;
    let created = match first_attempt {
        Ok(pr) => pr,
        Err(github::CreatePrError::Unauthorized) => {
            if !matches!(
                keyring_store::get_github_token_kind()?,
                Some(GithubTokenKind::OauthClerk)
            ) {
                return Err(github::CreatePrError::Unauthorized.into());
            }
            let session = auth_store::load_session()?
                .ok_or_else(|| AppError::Validation("no Mozart session — sign in first".into()))?;
            let fresh = match github::fetch_clerk_github_token(&session.token).await {
                github::ClerkGithubTokenResult::Ok { token: t, .. } => t,
                _ => return Err(github::CreatePrError::Unauthorized.into()),
            };
            keyring_store::set_github_token(&fresh, GithubTokenKind::OauthClerk)?;
            github::create_pr(
                &fresh,
                &owner,
                &repo,
                &head,
                &ws.base_branch,
                &title,
                &body,
                draft,
            )
            .await
            .map_err(AppError::from)?
        }
        Err(other) => return Err(other.into()),
    };
    {
        let conn = db.lock();
        workspaces::set_pr(&conn, &workspace_id, &created.html_url, created.number, "open")?;
    }
    Ok(created)
}

/// Plan §P2.6 "Merge-now flow". Runs the local-merge state machine on
/// the workspace's worktree and persists the resulting status.
///
/// Returns:
/// - `MergeOutcome { status: "done", conflicting_files: [] }` and flips
///   `workspace.ui_status = 'done'` so P0.2 freeze takes over.
/// - `MergeOutcome { status: "conflict", conflicting_files: […] }` and
///   flips `workspace.status = 'conflict'`. The worktree is left
///   mid-merge for the user to resolve in their IDE.
///
/// Surfaces typed precondition failures as `AppError`:
/// - `MergeDirtyTree` → frontend toast "Commit your changes before merging."
/// - `MergeBaseAhead(base)` → frontend toast "Pull <base> first."
#[tauri::command]
#[specta::specta]
pub async fn merge_workspace_locally(
    db: State<'_, DbState>,
    workspace_id: String,
) -> Result<MergeOutcome, AppError> {
    let (worktree_path, branch_name, base_branch) = {
        let conn = db.lock();
        workspaces::assert_workspace_active(&conn, &workspace_id)?;
        let ws = workspaces::get(&conn, &workspace_id)?;
        (ws.worktree_path, ws.branch_name, ws.base_branch)
    };
    let outcome = merge::merge_workspace_locally(
        std::path::Path::new(&worktree_path),
        &branch_name,
        &base_branch,
    )
    .await?;
    {
        let conn = db.lock();
        workspaces::update_status(&conn, &workspace_id, &outcome.status)?;
        if outcome.status == merge::STATUS_DONE {
            // P0.2 freeze trigger — the IPC guards key off `ui_status`.
            workspaces::set_ui_status(&conn, &workspace_id, "done")?;
        }
    }
    Ok(outcome)
}

/// Phase 5 / Atom 3 — load the persisted Mozart auth session from the
/// OS keyring. Returns `None` when no entry exists OR when the stored
/// payload is malformed (defensive : the front-end falls back to the
/// /welcome route and asks the user to re-authenticate).
#[tauri::command]
#[specta::specta]
pub async fn auth_load_session() -> Result<Option<AuthSessionDto>, AppError> {
    auth_store::load_session()
}

/// Phase 5 / Atom 3 — persist `session` to the OS keyring. Overwrites
/// any prior entry.
#[tauri::command]
#[specta::specta]
pub async fn auth_save_session(session: AuthSessionDto) -> Result<(), AppError> {
    auth_store::save_session(&session)
}

/// Phase 5 / Atom 3 — idempotent removal of the stored session. Safe to
/// call when no entry exists.
#[tauri::command]
#[specta::specta]
pub async fn auth_clear_session() -> Result<(), AppError> {
    auth_store::clear_session()
}

/// Persist onboarding completion to Clerk's `unsafe_metadata.onboarding`
/// via `{WEB_BASE_URL}/api/onboarding/complete`, using the stored Clerk
/// session JWT. This is the cross-surface source of truth the apps/web
/// profile and the `mozart` JWT template read — keeping it in sync means
/// a desktop user who finishes onboarding also shows "completed" on the
/// web. Routed through Rust (not a webview `fetch`) because Clerk's
/// Frontend API rejects requests from `tauri.localhost` (CORS).
#[tauri::command]
#[specta::specta]
pub async fn mark_onboarding_complete() -> Result<(), AppError> {
    let session = auth_store::load_session()?
        .ok_or_else(|| AppError::Validation("no Mozart session — sign in first".into()))?;
    github::mark_onboarding_complete(&session.token).await
}

/// Phase 5 follow-up — port of the localhost HTTP callback server
/// started in `lib.rs::setup`. The TS adapter reads this once at
/// bootstrap and embeds it in the apps/web sign-in URL so the
/// browser-side `fetch(http://127.0.0.1:<port>/auth)` knows where to
/// call. Returns `0` if the bind failed at boot (in which case the
/// HTTP transport is non-functional and the apps/web UI surfaces a
/// "Mozart isn't running" message — fail-closed, not fail-quiet).
#[tauri::command]
#[specta::specta]
pub fn auth_get_callback_port(
    state: tauri::State<'_, crate::auth::http_callback::CallbackPort>,
) -> u16 {
    state.0
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct NotificationPreferences {
    pub desktop: bool,
    pub sound: bool,
}

/// Read notification preferences from the resolved settings (bundled
/// defaults ◀ global `settings.json`). Both toggles default to `true`.
#[tauri::command]
#[specta::specta]
pub async fn get_notification_preferences() -> Result<NotificationPreferences, AppError> {
    let n = crate::settings::resolve(None).notifications;
    Ok(NotificationPreferences {
        desktop: n.desktop,
        sound: n.sound,
    })
}

/// Effective settings (bundled defaults ◀ global file ◀ project file).
/// `project_id` selects the project whose `.mozart/settings.json` applies;
/// `None` resolves defaults ◀ global only.
#[tauri::command]
#[specta::specta]
pub async fn get_resolved_settings(
    db: State<'_, DbState>,
    project_id: Option<String>,
) -> Result<crate::settings::SettingsDto, AppError> {
    let project_root = match project_id {
        Some(id) => {
            let conn = db.lock();
            Some(std::path::PathBuf::from(repos::get(&conn, &id)?.path))
        }
        None => None,
    };
    Ok(crate::settings::SettingsDto::from(
        crate::settings::resolve(project_root.as_deref()),
    ))
}

/// Persist the editable global settings file. Preference fields come from
/// the DTO; any `scripts` already in the global file are preserved.
#[tauri::command]
#[specta::specta]
pub async fn save_global_settings(dto: crate::settings::SettingsDto) -> Result<(), AppError> {
    let mut current = crate::settings::resolve(None);
    dto.apply_to(&mut current);
    crate::settings::save_global(&current)
}

/// Phase 6 / Atom 10 — persist notification preferences. Settings UI
/// calls this on every toggle.
#[tauri::command]
#[specta::specta]
pub async fn set_notification_preferences(
    prefs: NotificationPreferences,
) -> Result<(), AppError> {
    let mut current = crate::settings::resolve(None);
    current.notifications = crate::settings::Notifications {
        desktop: prefs.desktop,
        sound: prefs.sound,
    };
    crate::settings::save_global(&current)
}

/// Phase 6 / Atom 10 — surface a desktop notification when an agent
/// turn finishes on a chat the user isn't currently looking at. The
/// front-end decides when to call this (workspace unfocused / window
/// unfocused) ; the Rust side only enforces the user's pref toggle so
/// a stale call after toggle-off is still suppressed.
#[tauri::command]
#[specta::specta]
pub async fn emit_message_end_notification(
    app: tauri::AppHandle,
    chat_title: String,
) -> Result<(), AppError> {
    use tauri_plugin_notification::NotificationExt;
    let prefs = crate::settings::resolve(None).notifications;
    if !prefs.desktop {
        return Ok(());
    }
    let mut builder = app
        .notification()
        .builder()
        .title("Mozart")
        .body(format!("{chat_title} is ready"));
    if prefs.sound {
        builder = builder.sound("default");
    }
    builder
        .show()
        .map_err(|e| AppError::Io(format!("notification: {e}")))?;
    Ok(())
}

/// Play the end-of-turn chime through the OS audio stack. Called on a
/// focused turn-end (where the desktop popup is suppressed) and by the
/// Settings "test sound" button. The `sound` pref is enforced front-end
/// side so the test button can play unconditionally.
#[tauri::command]
#[specta::specta]
pub async fn play_chime() -> Result<(), AppError> {
    crate::sound::play()
}

/// Materialize (if missing) the bundled "Get started" project,
/// then ensure a `welcome-1` workspace exists on `main`. Idempotent —
/// re-entry from Settings → "Revisit tour" reuses the existing repo +
/// workspace instead of duplicating either.
#[tauri::command]
#[specta::specta]
pub async fn create_get_started_project(
    db: State<'_, DbState>,
) -> Result<crate::get_started::GetStartedProject, AppError> {
    crate::get_started::create(db.inner()).await
}

const ONBOARDING_PTY_ID: &str = "__onboarding_claude_login__";

fn home_dir_or_cwd() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return std::path::PathBuf::from(home);
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.is_empty() {
            return std::path::PathBuf::from(profile);
        }
    }
    std::path::PathBuf::from(".")
}

/// Phase 6 / Atom 3 — spawn `claude login` in a PTY rooted at the user's
/// HOME so the embedded xterm in the onboarding wizard can drive the
/// CLI's URL-paste flow. Returns the synthetic terminal id the JS side
/// uses for subsequent write/resize/close calls (the existing
/// `write_terminal`/`resize_terminal`/`close_terminal` commands are
/// key-by-string and work against this synthetic id).
///
/// We deliberately reuse `terminal::spawn_command` rather than introduce
/// a parallel PTY path : Phase 4's terminal_registry is the canonical
/// PTY infrastructure ; sharing it keeps lifecycle (Drop kills child,
/// kills master on registry.cancel) consistent.
///
/// Exit-code semantics : the terminal reader emits `Exited { code: 0 }`
/// unconditionally on EOF (see `terminal::spawn_inner`) — that's fine,
/// the front-end re-probes `claude_cli::session::has_session()` (via
/// the existing `check_claude_code_session` command) after the Exited
/// event arrives, which is the authoritative success signal.
#[tauri::command]
#[specta::specta]
pub async fn spawn_claude_login(
    registry: State<'_, TerminalRegistry>,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<String, AppError> {
    registry.cancel(ONBOARDING_PTY_ID);
    let cwd = home_dir_or_cwd();
    let handle = terminal::spawn_command(
        &cwd,
        cols.max(1),
        rows.max(1),
        "claude login".to_string(),
        on_event,
    )?;
    registry.register(ONBOARDING_PTY_ID.to_string(), std::sync::Arc::new(handle));
    Ok(ONBOARDING_PTY_ID.to_string())
}

/// Codex's parallel to [`spawn_claude_login`] — runs `codex login` in the
/// shared onboarding PTY. Reuses [`ONBOARDING_PTY_ID`] so switching the
/// configured provider mid-onboarding cancels the other login cleanly
/// (only one provider is configured at a time on the step). On the
/// terminal `Exited` event the frontend re-probes
/// `check_codex_session()` for the authoritative success signal.
#[tauri::command]
#[specta::specta]
pub async fn spawn_codex_login(
    registry: State<'_, TerminalRegistry>,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<String, AppError> {
    registry.cancel(ONBOARDING_PTY_ID);
    let cwd = home_dir_or_cwd();
    let handle = terminal::spawn_command(
        &cwd,
        cols.max(1),
        rows.max(1),
        "codex login".to_string(),
        on_event,
    )?;
    registry.register(ONBOARDING_PTY_ID.to_string(), std::sync::Arc::new(handle));
    Ok(ONBOARDING_PTY_ID.to_string())
}

/// Phase 6 / Atom 2 — detection probe for the onboarding wizard's Git
/// step. Spawns `git --version` (argv form, no shell) and parses the
/// stdout line `git version X.Y.Z`. Returns `None` when the binary is
/// not on PATH or the invocation fails. UI shows ✅ X.Y.Z or ❌ Not
/// found with OS-specific install copy.
#[tauri::command]
#[specta::specta]
pub async fn git_version() -> Result<Option<String>, AppError> {
    use crate::platform::NoWindow;
    use std::process::Command;
    let result = Command::new("git").arg("--version").no_window().output();
    let output = match result {
        Ok(o) => o,
        Err(_) => return Ok(None),
    };
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    // Format : "git version 2.42.0\n" (sometimes with trailing tag).
    // We isolate the third whitespace-separated token.
    let version = stdout
        .split_whitespace()
        .nth(2)
        .map(|s| s.trim_end_matches('\n').to_string());
    Ok(version)
}

/// Surface the user's global Git identity (`user.name` + `user.email`)
/// for the onboarding wizard's Git step. Returns `None` when either
/// value is missing — the UI then nudges the user to run
/// `git config --global user.name "…"` themselves.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

#[tauri::command]
#[specta::specta]
pub async fn git_identity() -> Result<Option<GitIdentity>, AppError> {
    use crate::platform::NoWindow;
    use std::process::Command;

    fn config_value(key: &str) -> Option<String> {
        let out = Command::new("git")
            .args(["config", "--global", "--get", key])
            .no_window()
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let trimmed = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    }

    let name = config_value("user.name");
    let email = config_value("user.email");
    match (name, email) {
        (Some(name), Some(email)) => Ok(Some(GitIdentity { name, email })),
        _ => Ok(None),
    }
}

/// Phase 6 / Atom 1 — read the local onboarding-completed mirror from the
/// `config` key-value table. Missing row fails-closed to `false` so a
/// brand-new install routes into the wizard.
///
/// Source-of-truth contract : the JWT carries an `onboarding` claim that
/// seeds initial routing on first sign-in (Atom 0). This local mirror
/// then takes over on every restart so the user doesn't re-onboard if
/// the mock-Clerk token resets the claim.
#[tauri::command]
#[specta::specta]
pub async fn get_onboarding_completed(
    db: State<'_, DbState>,
) -> Result<bool, AppError> {
    let conn = db.lock();
    let value = config::get(&conn, "onboarding_completed")?;
    Ok(value.as_deref() == Some("true"))
}

/// Phase 6 / Atom 1 — write the onboarding-completed flag. Called by the
/// onboarding facade when the user finishes step 4, and from settings'
/// "Revisit tour" (passes `false` to gate the wizard again).
#[tauri::command]
#[specta::specta]
pub async fn set_onboarding_completed(
    value: bool,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let conn = db.lock();
    config::set(
        &conn,
        "onboarding_completed",
        Some(if value { "true" } else { "false" }),
    )?;
    Ok(())
}

/// Read the persisted onboarding wizard cursor (e.g. `"git"`). Returns
/// `None` when the user has never advanced past the first step. The
/// frontend treats a missing/unknown value as `welcome`. Persisting only
/// the cursor — never the per-step check statuses — keeps the restored
/// wizard from showing stale "done" state: git / provider / github are
/// all re-probed live on reopen.
#[tauri::command]
#[specta::specta]
pub async fn get_onboarding_step(db: State<'_, DbState>) -> Result<Option<String>, AppError> {
    let conn = db.lock();
    config::get(&conn, "onboarding_step")
}

/// Persist the onboarding wizard cursor. Called from the facade on every
/// `advance()` / `back()` so closing the app mid-wizard resumes on the
/// same step. Reset (settings' "Revisit tour") writes `"welcome"`.
#[tauri::command]
#[specta::specta]
pub async fn set_onboarding_step(value: String, db: State<'_, DbState>) -> Result<(), AppError> {
    let conn = db.lock();
    config::set(&conn, "onboarding_step", Some(&value))?;
    Ok(())
}

/// Stable anonymous install identifier used as the PostHog `distinct_id`
/// before sign-in. Generated lazily on first read and persisted, so it
/// survives restarts and is the same value every analytics call sees.
#[tauri::command]
#[specta::specta]
pub async fn get_or_create_install_id(
    db: State<'_, DbState>,
) -> Result<String, AppError> {
    let conn = db.lock();
    if let Some(existing) = config::get(&conn, "install_id")? {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    config::set(&conn, "install_id", Some(&id))?;
    Ok(id)
}

/// Telemetry consent flag. Defaults to `true` for the private beta (no
/// opt-in screen yet) so we collect usage data to validate the product.
///
/// TODO(public-launch): before GA, surface telemetry consent in onboarding
/// + settings and decide whether this default should flip to opt-in.
/// See docs/engineering/analytics/ANALYTICS_ROADMAP.md P3.3 (release guard).
/// Pure decision for the telemetry consent flag. Unset → `true` (beta
/// default); only an explicit `"false"` disables. Split out so the
/// default semantics are unit-testable without a Tauri runtime.
pub(crate) fn telemetry_opt_in_from_stored(stored: Option<&str>) -> bool {
    stored != Some("false")
}

#[tauri::command]
#[specta::specta]
pub async fn get_telemetry_opt_in(
    db: State<'_, DbState>,
) -> Result<bool, AppError> {
    let conn = db.lock();
    let value = config::get(&conn, "telemetry_opt_in")?;
    Ok(telemetry_opt_in_from_stored(value.as_deref()))
}

/// Persist the telemetry consent flag. Wired to the P3 consent UX later;
/// exposed now so the gate is fully functional and testable.
#[tauri::command]
#[specta::specta]
pub async fn set_telemetry_opt_in(
    value: bool,
    db: State<'_, DbState>,
) -> Result<(), AppError> {
    let conn = db.lock();
    config::set(
        &conn,
        "telemetry_opt_in",
        Some(if value { "true" } else { "false" }),
    )?;
    Ok(())
}

// ===========================================================================
// Dev-only DB reset / demo seed (debug builds only)
//
// Both commands are gated behind `#[cfg(debug_assertions)]`, so the
// shipping release binary cannot wipe the user's DB even if a stray
// `invoke()` call reaches it — the command name doesn't exist at runtime.
//
// Call from devtools:
//   await window.__TAURI_INTERNALS__.invoke('reset_database_clean');
//   await window.__TAURI_INTERNALS__.invoke('reset_database_with_demo_seed');
//
// See `crate::db::reset` for the wipe order and seed contents.

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub async fn reset_database_clean(db: State<'_, DbState>) -> Result<(), AppError> {
    let mut conn = db.lock();
    crate::db::reset::reset_clean(&mut conn)
}

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
pub async fn reset_database_with_demo_seed(db: State<'_, DbState>) -> Result<(), AppError> {
    let mut conn = db.lock();
    crate::db::reset::reset_with_demo_seed(&mut conn)
}

// ===========================================================================
// P0.3 — project bootstrap on Open project
// ===========================================================================

/// Probe a project directory and return what Mozart inferred. Pure read,
/// no DB writes. Used by `bootstrap_project` internally and by future
/// "rescan" surfaces. Returns the flat summary the UI consumes — the
/// internal `ProjectDetection` (with the full ordered `RunConfig`) stays
/// crate-private.
#[tauri::command]
#[specta::specta]
pub async fn detect_project(
    path: String,
) -> Result<crate::mozart_config::bootstrap::DetectedSummary, AppError> {
    let p = std::path::Path::new(&path);
    let d = crate::mozart_config::detect::detect_project(p).await;
    Ok(crate::mozart_config::bootstrap::DetectedSummary::from_detection(&d))
}

/// Silent first-run bootstrap. Creates the project row (idempotent),
/// writes a `project_local_config` row if there's no `.mozart/`, creates
/// the first workspace, and creates the "Start" chat. Returns IDs +
/// detection so the UI can navigate directly into the workspace.
#[tauri::command]
#[specta::specta]
pub async fn bootstrap_project(
    db: State<'_, DbState>,
    path: String,
) -> Result<crate::mozart_config::bootstrap::BootstrapResult, AppError> {
    bootstrap_project_impl(db.inner(), path).await
}

pub(crate) async fn bootstrap_project_impl(
    db: &DbState,
    path: String,
) -> Result<crate::mozart_config::bootstrap::BootstrapResult, AppError> {
    let p = std::path::Path::new(&path);
    crate::mozart_config::bootstrap::bootstrap_project(db, p).await
}

/// Read the active project config. Repo > local; falls back to the
/// local DB row if the repo's `.mozart/settings.json` carries no
/// `scripts`. Bootstrap guarantees at least one of the two sources exists.
#[tauri::command]
#[specta::specta]
pub async fn read_project_config(
    db: State<'_, DbState>,
    project_id: String,
) -> Result<crate::mozart_config::bootstrap::ProjectConfig, AppError> {
    crate::mozart_config::bootstrap::read_project_config(db.inner(), &project_id)
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{Repo, Task, Thread};
    use crate::db::{init_db_memory, tasks};
    use std::path::Path;
    use std::process::Command;

    fn noop_channel() -> Channel<StreamEvent> {
        Channel::new(|_| Ok(()))
    }

    #[test]
    fn telemetry_opt_in_defaults_true_when_unset() {
        // Private-beta default: collect unless explicitly disabled.
        assert!(telemetry_opt_in_from_stored(None));
    }

    #[test]
    fn telemetry_opt_in_respects_explicit_values() {
        assert!(telemetry_opt_in_from_stored(Some("true")));
        assert!(!telemetry_opt_in_from_stored(Some("false")));
        // Any unexpected value is treated as opted-in (fail toward the beta
        // default rather than silently dropping data).
        assert!(telemetry_opt_in_from_stored(Some("garbage")));
    }

    /// Build a tempdir-backed git repo with identity + one seed commit on
    /// `main`. Mirrors `workspace_service.rs::tests::init_repo_with_main`.
    fn init_repo_with_main(repo: &Path) {
        let s = Command::new("git")
            .arg("init")
            .arg("--initial-branch=main")
            .arg(repo)
            .output()
            .expect("git init");
        assert!(s.status.success(), "git init failed: {:?}", s);
        for (k, v) in [
            ("user.email", "test@mozart.test"),
            ("user.name", "Test Bot"),
        ] {
            let s = Command::new("git")
                .current_dir(repo)
                .args(["config", k, v])
                .output()
                .expect("git config");
            assert!(s.status.success(), "git config {k} failed");
        }
        std::fs::write(repo.join("seed.txt"), "v1\n").unwrap();
        let s = Command::new("git")
            .current_dir(repo)
            .args(["add", "-A"])
            .output()
            .expect("git add");
        assert!(s.status.success(), "git add failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--no-gpg-sign", "-m", "seed"])
            .output()
            .expect("git commit");
        assert!(s.status.success(), "git commit failed: {:?}", s);
    }

    fn restore_root(prev: Option<std::ffi::OsString>) {
        match prev {
            Some(v) => std::env::set_var("MOZART_WORKTREES_ROOT", v),
            None => std::env::remove_var("MOZART_WORKTREES_ROOT"),
        }
    }

    fn seed_repo_row(db: &DbState, path: &str) -> String {
        let conn = db.lock();
        let r = Repo {
            repo_id: new_id(),
            path: path.into(),
            display_name: "test".into(),
            added_at: now_ms(),
            icon: None,
            hidden: false,
            sort_index: 0,
            run_command: None,
            setup_command: None,
        };
        repos::create(&conn, &r).unwrap();
        r.repo_id
    }

    /// Seed Task + Workspace + Thread for a given repo_id.
    /// Returns (workspace_id, thread_id).
    /// Helper for ContextCompiler-aware tests (post-T5): seed a chat in
    /// the given workspace and insert one user message in it. Returns
    /// `(chat_id, message_id)`. Tests that exercise `start_agent_run_impl`
    /// past the freeze guard need this so `build_envelope` can find the
    /// current_user_message_id.
    fn seed_chat_with_user_message(
        db: &DbState,
        workspace_id: &str,
        content: &str,
    ) -> (String, String) {
        let conn = db.lock();
        let chat = Chat {
            chat_id: new_id(),
            workspace_id: workspace_id.into(),
            title: "Untitled".into(),
            llm_id: None,
            mode: "agent".into(),
            effort: "medium".into(),
            last_read_message_id: None,
            closed_at: None,
            created_at: now_ms(),
        };
        chats::create(&conn, &chat).unwrap();
        let msg = Message {
            message_id: new_id(),
            chat_id: chat.chat_id.clone(),
            run_id: None,
            role: "user".into(),
            content: content.into(),
            mode: Some("agent".into()),
            status: "done".into(),
            timeline_json: None,
            created_at: now_ms(),
        };
        messages::insert(&conn, &msg).unwrap();
        (chat.chat_id, msg.message_id)
    }

    fn seed_workspace_chain(db: &DbState, repo_id: &str) -> (String, String) {
        let conn = db.lock();
        let t = Task {
            task_id: new_id(),
            repo_id: repo_id.into(),
            title: "t".into(),
            task_text: "t".into(),
            status: "active".into(),
            created_at: now_ms(),
        };
        tasks::create(&conn, &t).unwrap();
        let ws = Workspace {
            workspace_id: new_id(),
            task_id: t.task_id.clone(),
            name: "ws-seed".into(),
            worktree_path: format!("/wt-{}", new_id()),
            branch_name: "agent/wip-x".into(),
            base_branch: "main".into(),
            status: "ready".into(),
            pinned: false,
            unread: false,
            created_at: now_ms(),
            deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
        };
        workspaces::create(&conn, &ws).unwrap();
        let th = Thread {
            thread_id: new_id(),
            workspace_id: ws.workspace_id.clone(),
            created_at: now_ms(),
        };
        threads::create(&conn, &th).unwrap();
        (ws.workspace_id, th.thread_id)
    }

    #[cfg(debug_assertions)]
    #[tokio::test]
    async fn get_run_envelope_returns_none_for_unknown_run() {
        let db = init_db_memory().unwrap();
        let got = get_run_envelope_impl(&db, "no-such-run".into())
            .await
            .unwrap();
        assert!(got.is_none(), "expected None for an unknown run_id");
    }

    #[tokio::test]
    async fn list_repos_returns_empty_then_seeded() {
        let db = init_db_memory().unwrap();
        let got = list_repos_impl(&db).await.unwrap();
        assert!(got.is_empty(), "expected empty list initially");
        let _ = seed_repo_row(&db, "/tmp/seeded-repo");
        let got = list_repos_impl(&db).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].path, "/tmp/seeded-repo");
    }

    #[tokio::test]
    async fn add_repo_validates_then_creates_repo_row() {
        if !sandbox::git_available() {
            eprintln!("SKIP add_repo_validates_then_creates_repo_row: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("my-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let path_str = repo.to_string_lossy().into_owned();
        let got = add_repo_impl(&db, path_str.clone()).await.unwrap();
        assert_eq!(got.path, path_str);
        assert_eq!(got.display_name, "my-repo");
    }

    #[tokio::test]
    async fn add_repo_idempotent_returns_existing() {
        if !sandbox::git_available() {
            eprintln!("SKIP add_repo_idempotent_returns_existing: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("idem-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let path_str = repo.to_string_lossy().into_owned();
        let first = add_repo_impl(&db, path_str.clone()).await.unwrap();
        let second = add_repo_impl(&db, path_str.clone()).await.unwrap();
        assert_eq!(
            first.repo_id, second.repo_id,
            "second add_repo for the same path must return the existing row"
        );
        // Exactly one row in the DB.
        let conn = db.lock();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1, "no duplicate row may be inserted");
    }

    #[tokio::test]
    async fn remove_repo_deletes_row() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/rm");
        remove_repo_impl(&db, id.clone()).await.unwrap();
        let n: i64 = db
            .lock()
            .query_row(
                "SELECT COUNT(*) FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 0);
    }

    #[tokio::test]
    async fn remove_repo_unknown_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = remove_repo_impl(&db, "no-such".into()).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn set_repo_icon_round_trip() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/icon");
        set_repo_icon_impl(&db, id.clone(), Some("🎵".into()))
            .await
            .unwrap();
        let got: Option<String> = db
            .lock()
            .query_row(
                "SELECT icon FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got.as_deref(), Some("🎵"));
        set_repo_icon_impl(&db, id.clone(), None).await.unwrap();
        let got: Option<String> = db
            .lock()
            .query_row(
                "SELECT icon FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got, None);
    }

    #[tokio::test]
    async fn set_repo_hidden_round_trip() {
        let db = init_db_memory().unwrap();
        let id = seed_repo_row(&db, "/tmp/hid");
        set_repo_hidden_impl(&db, id.clone(), true).await.unwrap();
        let got: i64 = db
            .lock()
            .query_row(
                "SELECT hidden FROM repos WHERE repo_id = ?1",
                [&id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(got, 1);
    }

    #[tokio::test]
    async fn set_repo_sort_applies_full_ordering() {
        let db = init_db_memory().unwrap();
        let a = seed_repo_row(&db, "/tmp/a");
        let b = seed_repo_row(&db, "/tmp/b");
        let c = seed_repo_row(&db, "/tmp/c");
        set_repo_sort_impl(&db, vec![c.clone(), a.clone(), b.clone()])
            .await
            .unwrap();
        let got = list_repos_impl(&db).await.unwrap();
        let paths: Vec<_> = got.iter().map(|r| r.path.clone()).collect();
        assert_eq!(paths, vec!["/tmp/c", "/tmp/a", "/tmp/b"]);
    }

    #[tokio::test]
    async fn list_branches_returns_branches() {
        if !sandbox::git_available() {
            eprintln!("SKIP list_branches_returns_branches: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("lb-repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let got = list_branches(repo.to_string_lossy().into_owned())
            .await
            .expect("list_branches ok");
        assert!(
            got.iter().any(|b| b == "main"),
            "expected branches to include 'main', got {got:?}"
        );
    }

    // D1.5-L: env-gate Mutex is intentionally held across awaits.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn create_workspace_happy_path_via_command() {
        if !sandbox::git_available() {
            eprintln!("SKIP create_workspace_happy_path_via_command: git not on PATH");
            return;
        }
        let _gate = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root_dir = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root_dir.path());
        let repo = root_dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo_with_main(&repo);

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, &repo.to_string_lossy());

        let ws = create_workspace_impl(
            &db,
            repo_id,
            "main".into(),
            "Add OAuth\nfull body".into(),
            "eminem".into(),
        )
        .await
        .expect("create_workspace_impl ok");
        assert_eq!(ws.status, "ready");
        assert_eq!(ws.name, "eminem");
        // Branch is derived from the workspace name.
        assert_eq!(ws.branch_name, "mozart/eminem");

        restore_root(prev);
    }

    #[tokio::test]
    async fn list_workspaces_returns_seeded() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lw");
        let _ = seed_workspace_chain(&db, &repo_id);
        let got = list_workspaces_impl(&db).await.unwrap();
        assert_eq!(got.len(), 1);
    }

    #[tokio::test]
    async fn list_tasks_returns_seeded_tasks_for_repo() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lt");
        // First task comes from the shared seed helper.
        let _ = seed_workspace_chain(&db, &repo_id);
        // Second task: insert directly with a strictly-later created_at
        // to verify ordering through the command layer.
        let later_created_at = {
            let conn = db.lock();
            let max: i64 = conn
                .query_row(
                    "SELECT MAX(created_at) FROM tasks WHERE repo_id = ?1",
                    [&repo_id],
                    |r| r.get(0),
                )
                .unwrap();
            let t2 = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "second task".into(),
                task_text: "do second".into(),
                status: "active".into(),
                created_at: max + 1,
            };
            tasks::create(&conn, &t2).unwrap();
            t2.created_at
        };

        let got = list_tasks_impl(&db, repo_id.clone()).await.unwrap();
        assert_eq!(got.len(), 2, "expected exactly two tasks for the repo");
        assert!(
            got[0].created_at <= got[1].created_at,
            "tasks must be returned in ascending created_at order"
        );
        assert_eq!(
            got[1].created_at, later_created_at,
            "the latest-inserted task must come last"
        );
    }

    #[tokio::test]
    async fn list_tasks_returns_empty_for_unknown_repo() {
        let db = init_db_memory().unwrap();
        // Seed a real repo + chain so the tasks table is non-empty,
        // then query a different repo_id.
        let repo_id = seed_repo_row(&db, "/tmp/lt-empty");
        let _ = seed_workspace_chain(&db, &repo_id);

        let got = list_tasks_impl(&db, "no-such-repo".into()).await.unwrap();
        assert!(
            got.is_empty(),
            "unknown repo_id must yield empty Vec, not error"
        );
    }

    #[tokio::test]
    async fn archive_workspace_flips_deletion_intent_and_removes_worktree() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/aw");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);

        // Replace the seed's placeholder worktree path with a real
        // tempdir so we can assert the on-disk wipe actually happened.
        let wt = tempfile::tempdir().unwrap();
        let wt_path = wt.path().to_path_buf();
        std::fs::write(wt_path.join("scratch.txt"), b"keep-me-around").unwrap();
        {
            let conn = db.lock();
            workspaces::update_worktree_path(
                &conn,
                &ws_id,
                &wt_path.to_string_lossy(),
            )
            .unwrap();
        }
        assert!(wt_path.exists(), "precondition: worktree dir should exist");

        archive_workspace_impl(&db, ws_id.clone()).await.unwrap();

        let conn = db.lock();
        let ws = workspaces::get(&conn, &ws_id).unwrap();
        assert_eq!(ws.deletion_intent, 1, "soft-delete flag must flip");
        assert!(
            !wt_path.exists(),
            "worktree directory must be wiped on archive"
        );
    }

    // archive_workspace deletes the Mozart-owned git branch in addition to
    // the worktree directory. Requires a real git repo to observe the branch.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn archive_workspace_deletes_mozart_branch() {
        if !sandbox::git_available() {
            eprintln!("SKIP archive_workspace_deletes_mozart_branch: git not on PATH");
            return;
        }
        let _gate = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = tempfile::tempdir().unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());
        let repo_path = root.path().join("repo");
        std::fs::create_dir_all(&repo_path).unwrap();
        init_repo_with_main(&repo_path);

        // Use worktree::create so we get a real linked worktree + branch.
        let db = init_db_memory().unwrap();
        let ws_id = {
            let conn = db.lock();
            let r = Repo {
                repo_id: new_id(),
                path: repo_path.to_string_lossy().into_owned(),
                display_name: "test".into(),
                added_at: now_ms(),
                icon: None,
                hidden: false,
                sort_index: 0,
                run_command: None,
                setup_command: None,
            };
            repos::create(&conn, &r).unwrap();
            let t = Task {
                task_id: new_id(),
                repo_id: r.repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws_id = new_id();
            let ws = Workspace {
                workspace_id: ws_id.clone(),
                task_id: t.task_id,
                name: "pavarotti".into(),
                worktree_path: "/placeholder".into(),
                branch_name: String::new(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
                ui_status: "backlog".into(),
                last_merge_action: None,
                sandbox_level: "L2Project".into(),
                pr_url: None,
                pr_number: None,
                pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            ws_id
        };

        // Create the real worktree + branch, then patch the DB row.
        let handle = worktree::create(&db, &repo_path, "main", &ws_id, "pavarotti", "Mozart App")
            .await
            .expect("worktree create ok");
        {
            let conn = db.lock();
            workspaces::update_worktree_path(
                &conn,
                &ws_id,
                &handle.worktree_path.to_string_lossy(),
            )
            .unwrap();
            workspaces::update_branch_name(&conn, &ws_id, &handle.branch_name).unwrap();
        }
        assert_eq!(handle.branch_name, "mozart/pavarotti");
        assert!(handle.worktree_path.exists(), "precondition: dir exists");
        assert!(
            crate::branch_name::branch_exists(&repo_path, "mozart/pavarotti").await,
            "precondition: branch exists"
        );

        archive_workspace_impl(&db, ws_id.clone()).await.unwrap();

        let conn = db.lock();
        let ws = workspaces::get(&conn, &ws_id).unwrap();
        assert_eq!(ws.deletion_intent, 1, "soft-delete flag must flip");
        assert!(!handle.worktree_path.exists(), "worktree dir must be wiped");
        assert!(
            !crate::branch_name::branch_exists(&repo_path, "mozart/pavarotti").await,
            "mozart branch must be deleted on archive"
        );

        restore_root(prev);
    }

    #[tokio::test]
    async fn rename_workspace_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/rw");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        rename_workspace_impl(&db, ws_id.clone(), "pavarotti".into())
            .await
            .unwrap();
        let conn = db.lock();
        let ws = workspaces::get(&conn, &ws_id).unwrap();
        assert_eq!(ws.name, "pavarotti");
        // branch_name is decoupled — must not change.
        assert_eq!(ws.branch_name, "agent/wip-x");
    }

    #[tokio::test]
    async fn rename_workspace_unknown_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = rename_workspace_impl(&db, "no-such".into(), "x".into())
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn set_workspace_ui_status_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/us");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().ui_status,
            "backlog"
        );
        set_workspace_ui_status_impl(&db, ws_id.clone(), "in_progress".into())
            .await
            .unwrap();
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().ui_status,
            "in_progress"
        );
    }

    #[tokio::test]
    async fn set_workspace_pinned_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/swp");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        set_workspace_pinned_impl(&db, ws_id.clone(), true).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().pinned, true);
        set_workspace_pinned_impl(&db, ws_id.clone(), false).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().pinned, false);
    }

    #[tokio::test]
    async fn set_workspace_pinned_unknown_id_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = set_workspace_pinned_impl(&db, "no-such-ws".into(), true)
            .await
            .expect_err("unknown id must error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn set_workspace_unread_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/swu");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        set_workspace_unread_impl(&db, ws_id.clone(), true).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().unread, true);
        set_workspace_unread_impl(&db, ws_id.clone(), false).await.unwrap();
        assert_eq!(workspaces::get(&db.lock(), &ws_id).unwrap().unread, false);
    }

    #[tokio::test]
    async fn set_workspace_unread_unknown_id_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = set_workspace_unread_impl(&db, "no-such-ws".into(), true)
            .await
            .expect_err("unknown id must error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn set_workspace_sandbox_level_round_trips_through_command() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sbx");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        // Default is L2Project (migration 010); confirm we can flip
        // to L3 and back through the Tauri command layer, not just
        // the raw DB mutator.
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().sandbox_level,
            "L2Project"
        );
        set_workspace_sandbox_level_impl(&db, ws_id.clone(), "L3Workspace".into())
            .await
            .unwrap();
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().sandbox_level,
            "L3Workspace"
        );
        set_workspace_sandbox_level_impl(&db, ws_id.clone(), "L1Mozart".into())
            .await
            .unwrap();
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().sandbox_level,
            "L1Mozart"
        );
    }

    #[tokio::test]
    async fn set_workspace_sandbox_level_rejects_unknown_string() {
        // The DB column is TEXT so the SQL layer would happily accept
        // garbage; the parse step in the command rejects it instead so
        // a corrupted row never widens agent reach.
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sbxr");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let err = set_workspace_sandbox_level_impl(&db, ws_id.clone(), "L4Cosmic".into())
            .await
            .expect_err("unknown level must be rejected");
        assert!(matches!(err, AppError::Validation(_)));
        // DB row must be untouched on parse failure.
        assert_eq!(
            workspaces::get(&db.lock(), &ws_id).unwrap().sandbox_level,
            "L2Project"
        );
    }

    #[tokio::test]
    async fn set_workspace_sandbox_level_unknown_id_returns_not_found() {
        let db = init_db_memory().unwrap();
        let err = set_workspace_sandbox_level_impl(&db, "no-such-ws".into(), "L3Workspace".into())
            .await
            .expect_err("unknown workspace must error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_creates_row_and_registers_handle() {
        if !sandbox::git_available() {
            eprintln!("SKIP start_agent_run_creates_row_and_registers_handle: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Build a real git-initialized worktree under a tempdir worktrees-root.
        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar");
        // Seed task + workspace + thread, but use the real wt path on the
        // workspace so git_checkpoint can run there.
        let (ws_id, _thread_id) = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            (ws.workspace_id, th.thread_id)
        };

        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var(
            "MOZART_MOCK_FIXTURE",
            fixtures.join("streams/happy-text.jsonl"),
        );
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let registry = RunRegistry::new();
        let (chat_id, msg_id) =
            seed_chat_with_user_message(&db, &ws_id, "do the thing");
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            chat_id,
            msg_id,
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| (),
        )
        .await
        .expect("start_agent_run_impl ok");
        assert_eq!(run.status, "running");

        // The registry now has an entry; cancel by id must succeed.
        // Give the supervisor a moment to start before we tear down.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        registry
            .cancel(&run.run_id)
            .await
            .expect("registry has the run id");

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn stop_agent_run_cancels_known_run() {
        if !sandbox::git_available() {
            eprintln!("SKIP stop_agent_run_cancels_known_run: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Slow fixture so the run is alive when we stop it.
        let dir = tempfile::tempdir().unwrap();
        let slow = dir.path().join("slow.sh");
        std::fs::write(&slow, "#!/bin/sh\nsleep 10\necho should-not-appear\n").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&slow).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&slow, p).unwrap();
        }

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-stop");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            ws.workspace_id
        };

        std::env::set_var("MOZART_CLAUDE_BIN", &slow);
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let registry = RunRegistry::new();
        let (chat_id, msg_id) = seed_chat_with_user_message(&db, &ws_id, "do");
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            chat_id,
            msg_id,
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| (),
        )
        .await
        .expect("start_agent_run_impl ok");

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        stop_agent_run_impl(&registry, run.run_id.clone())
            .await
            .expect("known run id cancels cleanly");

        // Unknown run id → NotFound.
        let err = stop_agent_run_impl(&registry, "no-such-run".into())
            .await
            .expect_err("unknown id must error");
        assert!(
            matches!(err, AppError::NotFound(_)),
            "expected NotFound, got {err:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    #[tokio::test]
    async fn list_runs_returns_runs_for_workspace() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/lr");
        let (ws_id, thread_id) = seed_workspace_chain(&db, &repo_id);
        {
            let conn = db.lock();
            for i in 0..2 {
                let r = AgentRun {
                    run_id: new_id(),
                    thread_id: thread_id.clone(),
                    prompt: format!("p{i}"),
                    status: "done".into(),
                    started_at: now_ms() + i,
                    ended_at: None,
                    exit_code: None,
                    error_message: None,
                    checkpoint_sha: None,
                    prompt_source: "message_content".into(),
                };
                agent_runs::create(&conn, &r).unwrap();
            }
        }
        let got = list_runs_impl(&db, ws_id).await.unwrap();
        assert_eq!(got.len(), 2);
    }

    #[tokio::test]
    async fn get_workspace_diff_returns_latest_or_none() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/gwd");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let got = get_workspace_diff_impl(&db, ws_id.clone()).await.unwrap();
        assert!(got.is_none(), "no change yet");

        {
            let conn = db.lock();
            let change = WorkspaceChange {
                change_id: 0,
                workspace_id: ws_id.clone(),
                run_id: None,
                diff_text: "diff --git a/x b/x\n".into(),
                files_added: 1,
                files_modified: 0,
                files_deleted: 0,
                captured_at: now_ms(),
            };
            workspace_changes::insert(&conn, &change).unwrap();
        }
        let got = get_workspace_diff_impl(&db, ws_id.clone()).await.unwrap();
        let c = got.expect("Some(change) after insert");
        assert_eq!(c.workspace_id, ws_id);
    }

    #[tokio::test]
    async fn discard_workspace_changes_no_prior_run_returns_validation() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/dwc");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        // No AgentRun rows → expect Validation.
        let err = discard_workspace_changes_impl(&db, ws_id)
            .await
            .expect_err("must error with no checkpoint");
        match err {
            AppError::Validation(msg) => assert!(
                msg.contains("no checkpoint to discard to"),
                "unexpected message: {msg}"
            ),
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn create_list_chats_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/cc");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let c = create_chat_impl(&db, ws_id.clone(), "alpha".into(), None)
            .await
            .unwrap();
        let got = list_chats_impl(&db, ws_id.clone()).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].chat_id, c.chat_id);
        assert_eq!(got[0].title, "alpha");
    }

    #[tokio::test]
    async fn rename_close_chat_round_trip() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/rcc");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let c = create_chat_impl(&db, ws_id.clone(), "alpha".into(), None)
            .await
            .unwrap();
        rename_chat_impl(&db, c.chat_id.clone(), "beta".into())
            .await
            .unwrap();
        let open = list_chats_impl(&db, ws_id.clone()).await.unwrap();
        assert_eq!(open[0].title, "beta");
        close_chat_impl(&db, c.chat_id.clone()).await.unwrap();
        let open = list_chats_impl(&db, ws_id).await.unwrap();
        assert!(open.is_empty());
    }

    #[tokio::test]
    async fn active_chat_set_get() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/ac");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let c = create_chat_impl(&db, ws_id.clone(), "x".into(), None)
            .await
            .unwrap();
        assert_eq!(
            get_active_chat_impl(&db, ws_id.clone()).await.unwrap(),
            None
        );
        set_active_chat_impl(&db, ws_id.clone(), c.chat_id.clone())
            .await
            .unwrap();
        assert_eq!(
            get_active_chat_impl(&db, ws_id).await.unwrap(),
            Some(c.chat_id),
        );
    }

    #[tokio::test]
    async fn message_insert_and_list() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/mi");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let c = create_chat_impl(&db, ws_id, "x".into(), None).await.unwrap();
        let m1_id = new_id();
        insert_message_impl(
            &db,
            m1_id.clone(),
            c.chat_id.clone(),
            "user".into(),
            "hi".into(),
            Some("normal".into()),
            "done".into(),
            None,
            None,
        )
        .await
        .unwrap();
        let m2_id = new_id();
        insert_message_impl(
            &db,
            m2_id.clone(),
            c.chat_id.clone(),
            "assistant".into(),
            "".into(),
            Some("normal".into()),
            "streaming".into(),
            None,
            None,
        )
        .await
        .unwrap();
        let got = list_messages_impl(&db, c.chat_id).await.unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].message_id, m1_id);
        assert_eq!(got[1].message_id, m2_id);
    }

    #[tokio::test]
    async fn message_update_content_status_timeline() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/mu");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        let c = create_chat_impl(&db, ws_id, "x".into(), None).await.unwrap();
        let mid = new_id();
        insert_message_impl(
            &db,
            mid.clone(),
            c.chat_id.clone(),
            "assistant".into(),
            "".into(),
            None,
            "streaming".into(),
            None,
            None,
        )
        .await
        .unwrap();
        update_message_content_impl(&db, mid.clone(), "partial".into())
            .await
            .unwrap();
        update_message_status_impl(&db, mid.clone(), "done".into())
            .await
            .unwrap();
        update_message_timeline_impl(&db, mid.clone(), Some(r#"{"x":1}"#.into()))
            .await
            .unwrap();
        let got = list_messages_impl(&db, c.chat_id).await.unwrap();
        assert_eq!(got[0].content, "partial");
        assert_eq!(got[0].status, "done");
        assert_eq!(got[0].timeline_json.as_deref(), Some(r#"{"x":1}"#));
    }

    #[tokio::test]
    async fn check_claude_install_returns_some_variant() {
        let got = check_claude_install().await;
        assert!(
            matches!(got, ClaudeInstall::Installed { .. } | ClaudeInstall::Missing),
            "check_claude_install must return one of the two variants"
        );
    }

    // 14. AgentRunTerminated emission — Q2 audit lock
    //
    // The Tauri command wraps this closure with `tauri_specta::Event::emit`,
    // but the `_impl` surface is generic over `Fn(AgentRunTerminated)`, so
    // these tests capture emissions into a Mutex-protected Vec without
    // booting a Tauri runtime.

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_emits_terminated_on_done() {
        if !sandbox::git_available() {
            eprintln!(
                "SKIP start_agent_run_emits_terminated_on_done: git not on PATH"
            );
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-emit-done");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            ws.workspace_id
        };

        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var(
            "MOZART_MOCK_FIXTURE",
            fixtures.join("streams/happy-text.jsonl"),
        );
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        // Shared capture buffer. The closure is Fn + Send + Sync + 'static
        // because the supervisor task moves it across the .spawn boundary.
        let captured: std::sync::Arc<std::sync::Mutex<Vec<AgentRunTerminated>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured_for_closure = captured.clone();

        let registry = RunRegistry::new();
        let (chat_id, msg_id) = seed_chat_with_user_message(&db, &ws_id, "do");
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            chat_id,
            msg_id,
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            move |ev| {
                if let Ok(mut g) = captured_for_closure.lock() {
                    g.push(ev);
                }
            },
        )
        .await
        .expect("start_agent_run_impl ok");

        // The supervisor task runs detached; give it time to reach
        // `mark_ended` + `emit_terminated`. The happy-text fixture
        // typically completes in well under 500ms.
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;

        let snapshot = captured.lock().unwrap().clone();
        assert!(
            !snapshot.is_empty(),
            "expected at least one AgentRunTerminated emission, got none"
        );
        let matching: Vec<_> = snapshot
            .iter()
            .filter(|e| e.run_id == run.run_id && e.status == "done")
            .collect();
        assert!(
            !matching.is_empty(),
            "expected an emission with status='done' for this run_id, got {snapshot:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn start_agent_run_emits_terminated_on_stop() {
        if !sandbox::git_available() {
            eprintln!(
                "SKIP start_agent_run_emits_terminated_on_stop: git not on PATH"
            );
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        // Use sleep 2 (not 10) so even if SIGKILL leaves an orphaned
        // `sleep` child whose pipes outlive the parent shell — blocking
        // the supervisor's drain tasks on EOF — the test still completes
        // in a few seconds rather than the full 10s the runner-level
        // integration_cancel_mid_stream test budgets for.
        let dir = tempfile::tempdir().unwrap();
        let slow = dir.path().join("slow.sh");
        std::fs::write(
            &slow,
            "#!/bin/sh\nsleep 2\necho should-not-appear\n",
        )
        .unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut p = std::fs::metadata(&slow).unwrap().permissions();
            p.set_mode(0o755);
            std::fs::set_permissions(&slow, p).unwrap();
        }

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/sar-emit-stop");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
            ui_status: "backlog".into(),
            last_merge_action: None,
            sandbox_level: "L2Project".into(),
            pr_url: None,
            pr_number: None,
            pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            ws.workspace_id
        };

        // Route through mock-claude.sh so the slow fixture is `exec`ed
        // by sh — SIGKILL then targets the actual `sleep` process. If
        // we point MOZART_CLAUDE_BIN at slow.sh directly, the shell
        // spawns sleep as a separate child whose pipes outlive the
        // SIGKILL'd shell, hanging the drain tasks for the full 10s.
        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var("MOZART_MOCK_FIXTURE", &slow);
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let captured: std::sync::Arc<std::sync::Mutex<Vec<AgentRunTerminated>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let captured_for_closure = captured.clone();

        let registry = RunRegistry::new();
        let (chat_id, msg_id) = seed_chat_with_user_message(&db, &ws_id, "do");
        let run = start_agent_run_impl(
            &db,
            &registry,
            ws_id,
            chat_id,
            msg_id,
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            move |ev| {
                if let Ok(mut g) = captured_for_closure.lock() {
                    g.push(ev);
                }
            },
        )
        .await
        .expect("start_agent_run_impl ok");

        // Let the child start, then cancel it.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        stop_agent_run_impl(&registry, run.run_id.clone())
            .await
            .expect("known run cancels");

        // Allow the supervisor to drain + mark_ended + emit_terminated.
        // Poll the capture buffer up to 8s rather than hard-sleeping a
        // flat amount — SIGKILL on the wrapper shell may leave an
        // orphaned `sleep` child whose pipes outlive the parent shell,
        // forcing the drain tasks to wait for the orphan to die before
        // they see EOF. With a `sleep 2` fixture this resolves in ~2-4s.
        let stopped_seen = {
            let mut found = false;
            for _ in 0..80 {
                tokio::time::sleep(std::time::Duration::from_millis(100))
                    .await;
                let snapshot = captured.lock().unwrap().clone();
                if snapshot
                    .iter()
                    .any(|e| e.run_id == run.run_id && e.status == "stopped")
                {
                    found = true;
                    break;
                }
            }
            found
        };
        let snapshot = captured.lock().unwrap().clone();
        // Helpful diagnostic if emit never fires: did the supervisor at
        // least reach mark_ended?
        let db_status = agent_runs::get(&db.lock(), &run.run_id)
            .map(|r| r.status)
            .unwrap_or_else(|_| "<row not found>".into());
        assert!(
            stopped_seen,
            "expected an emission with status='stopped' after cancel within 5s. \
             DB row status='{db_status}', captured={snapshot:?}"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    // T10 — Two-turn recall: turn 1's user message must appear in
    // turn 2's persisted envelope. This is the headline invariant of
    // the ContextCompiler v1 architecture; failure here means the
    // agent-amnesia bug has regressed. The test runs both turns
    // end-to-end through `start_agent_run_impl` against the mock
    // claude, then reads `agent_run_envelopes.rendered_text` for
    // turn 2 and asserts it carries turn 1's content inside the
    // RECENT_CONVERSATION layer.
    #[cfg(unix)]
    #[allow(clippy::await_holding_lock)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn integration_two_turn_recall_envelope_contains_prior_turn() {
        use crate::db::agent_run_envelopes;

        if !sandbox::git_available() {
            eprintln!("SKIP integration_two_turn_recall: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate()
            .lock()
            .unwrap_or_else(|p| p.into_inner());

        let root = tempfile::tempdir().unwrap();
        let wt = tempfile::tempdir_in(root.path()).unwrap();
        init_repo_with_main(wt.path());

        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/two-turn");
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-x".into(),
                worktree_path: wt.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
                ui_status: "backlog".into(),
                last_merge_action: None,
                sandbox_level: "L2Project".into(),
                pr_url: None,
                pr_number: None,
                pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            let th = Thread {
                thread_id: new_id(),
                workspace_id: ws.workspace_id.clone(),
                created_at: now_ms(),
            };
            threads::create(&conn, &th).unwrap();
            ws.workspace_id
        };

        let fixtures = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures");
        std::env::set_var("MOZART_CLAUDE_BIN", fixtures.join("mock-claude.sh"));
        std::env::set_var(
            "MOZART_MOCK_FIXTURE",
            fixtures.join("streams/happy-text.jsonl"),
        );
        std::env::set_var("MOZART_WORKTREES_ROOT", root.path());

        let registry = RunRegistry::new();

        // ---- Turn 1: distinctive user message that must reappear in
        // turn 2's envelope. The string is unique-enough that a substring
        // search won't false-positive against the static SYSTEM_RULES
        // sandbox clamp.
        const TURN1_TEXT: &str = "MOZART_T10_TURN1_NEEDLE remember: alpha-delta-bravo";
        let (chat_id, msg1_id) =
            seed_chat_with_user_message(&db, &ws_id, TURN1_TEXT);
        let turn1 = start_agent_run_impl(
            &db,
            &registry,
            ws_id.clone(),
            chat_id.clone(),
            msg1_id.clone(),
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| (),
        )
        .await
        .expect("turn 1 start_agent_run_impl ok");

        // Wait for turn 1's supervisor to mark done. happy-text completes
        // well under 800ms; we poll for status='done' as a robust signal.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        loop {
            let status = agent_runs::get(&db.lock(), &turn1.run_id)
                .map(|r| r.status)
                .unwrap_or_default();
            if status == "done" || status == "error" {
                break;
            }
            if std::time::Instant::now() >= deadline {
                panic!("turn 1 never reached terminal status (got '{status}')");
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        // ---- Turn 2: a second user message in the same chat. The
        // ContextCompiler should pull msg1 into RECENT_CONVERSATION on
        // this build.
        let msg2_id = {
            let conn = db.lock();
            let m = Message {
                message_id: new_id(),
                chat_id: chat_id.clone(),
                run_id: None,
                role: "user".into(),
                content: "second turn".into(),
                mode: Some("agent".into()),
                status: "done".into(),
                timeline_json: None,
                created_at: now_ms() + 1, // strictly after msg1
            };
            messages::insert(&conn, &m).unwrap();
            m.message_id
        };

        let turn2 = start_agent_run_impl(
            &db,
            &registry,
            ws_id.clone(),
            chat_id.clone(),
            msg2_id,
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| (),
        )
        .await
        .expect("turn 2 start_agent_run_impl ok");

        // The IPC writes the envelope row synchronously before returning,
        // so turn 2's envelope is on disk by the time we get here.
        let env2 = agent_run_envelopes::get_by_run(&db.lock(), &turn2.run_id)
            .expect("agent_run_envelopes row for turn 2 exists");

        assert!(
            env2.rendered_text.contains("MOZART_T10_TURN1_NEEDLE"),
            "turn 2's envelope must include turn 1's user content — \
             this is the agent-amnesia regression guard"
        );
        assert!(
            env2.rendered_text.contains("MOZART_LAYER_RECENT_CONVERSATION_"),
            "turn 2's envelope must include the RECENT_CONVERSATION layer"
        );
        assert_eq!(
            env2.chat_id, chat_id,
            "envelope row must be scoped to the right chat"
        );

        std::env::remove_var("MOZART_CLAUDE_BIN");
        std::env::remove_var("MOZART_MOCK_FIXTURE");
        std::env::remove_var("MOZART_WORKTREES_ROOT");
    }

    // =================================================================
    // P0.2 — Freeze enforcement: each guarded command returns
    // `AppError::Frozen(workspace_id)` when ui_status == "done".
    // =================================================================

    fn mark_workspace_done(db: &DbState, workspace_id: &str) {
        let conn = db.lock();
        workspaces::set_ui_status(&conn, workspace_id, "done").unwrap();
    }

    fn assert_frozen(result: Result<impl std::fmt::Debug, AppError>, expected_id: &str) {
        match result {
            Err(AppError::Frozen(id)) => assert_eq!(id, expected_id),
            other => panic!("expected AppError::Frozen({expected_id}), got {other:?}"),
        }
    }

    #[test]
    fn assert_workspace_active_returns_frozen_when_done() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-helper");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let conn = db.lock();
        let result = workspaces::assert_workspace_active(&conn, &ws_id);
        match result {
            Err(AppError::Frozen(id)) => assert_eq!(id, ws_id),
            other => panic!("expected Frozen, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn start_agent_run_returns_frozen_when_workspace_done() {
        let db = init_db_memory().unwrap();
        let registry = RunRegistry::new();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-spawn");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let result = start_agent_run_impl(
            &db,
            &registry,
            ws_id.clone(),
            "dummy-chat-id".into(),
            "dummy-msg-id".into(),
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| {},
        )
        .await;
        assert_frozen(result, &ws_id);
    }

    // Dogfood 2026-05-22 falsified the "`ask` is provably read-only"
    // assumption — even with `--allowedTools=Read,Glob,Grep` in the
    // argv, the agent successfully edited a file when asked. So `ask`
    // mode no longer bypasses the IPC freeze guard: a frozen workspace
    // refuses every `start_agent_run`, mode notwithstanding. When
    // TODO-001 (OS-level fence) lands, the bypass can be reconsidered.
    #[tokio::test]
    async fn start_agent_run_refuses_ask_mode_on_frozen_workspace() {
        let db = init_db_memory().unwrap();
        let registry = RunRegistry::new();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-ask");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let result = start_agent_run_impl(
            &db,
            &registry,
            ws_id.clone(),
            "dummy-chat-id".into(),
            "dummy-msg-id".into(),
            "ask".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| {},
        )
        .await;
        match result {
            Err(AppError::Frozen(_)) => {} // expected
            Ok(_) => panic!("ask mode must NOT bypass freeze: got Ok"),
            Err(other) => panic!("expected Frozen, got {other:?}"),
        }
    }

    // Canceled is also a frozen state (per the kanban model) — same
    // guard semantics as `done`.
    #[tokio::test]
    async fn start_agent_run_returns_frozen_when_workspace_canceled() {
        let db = init_db_memory().unwrap();
        let registry = RunRegistry::new();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-canceled");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        {
            let conn = db.lock();
            workspaces::set_ui_status(&conn, &ws_id, "canceled").unwrap();
        }

        let result = start_agent_run_impl(
            &db,
            &registry,
            ws_id.clone(),
            "dummy-chat-id".into(),
            "dummy-msg-id".into(),
            "agent".into(),
            "claude_cli".into(),
            None,
            noop_channel(),
            |_| {},
        )
        .await;
        assert_frozen(result, &ws_id);
    }

    #[tokio::test]
    async fn install_workspace_packages_returns_frozen_when_workspace_done() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-install");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let result = install_workspace_packages_impl(&db, ws_id.clone()).await;
        assert_frozen(result, &ws_id);
    }

    #[tokio::test]
    async fn start_workspace_run_returns_frozen_when_workspace_done() {
        let db = init_db_memory().unwrap();
        let registry = WorkspaceRunRegistry::new();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-run");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let on_event: Channel<TerminalEvent> = Channel::new(|_| Ok(()));
        let result = start_workspace_command_impl(
            &db,
            &registry,
            ws_id.clone(),
            80,
            24,
            on_event,
            WorkspaceCommandKind::Run,
        )
        .await;
        assert_frozen(result, &ws_id);
    }

    #[tokio::test]
    async fn write_terminal_returns_frozen_when_workspace_done() {
        let db = init_db_memory().unwrap();
        let registry = TerminalRegistry::new();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-term");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let result = write_terminal_impl(&db, &registry, ws_id.clone(), "ls\n".into()).await;
        assert_frozen(result, &ws_id);
    }

    #[tokio::test]
    async fn write_terminal_bypasses_workspace_guard_for_onboarding_pty() {
        // The onboarding login PTY has no workspace row, so the
        // frozen-workspace guard must be skipped — otherwise every
        // keystroke is rejected with NotFound and the terminal is dead.
        let db = init_db_memory().unwrap();
        let registry = TerminalRegistry::new();
        let on_event: Channel<TerminalEvent> = Channel::new(|_| Ok(()));
        let handle = crate::terminal::spawn_command(
            std::path::Path::new("."),
            80,
            24,
            "sleep 5".into(),
            on_event,
        )
        .unwrap();
        registry.register(ONBOARDING_PTY_ID.to_string(), std::sync::Arc::new(handle));

        let result =
            write_terminal_impl(&db, &registry, ONBOARDING_PTY_ID.to_string(), "\n".into()).await;
        assert!(result.is_ok(), "onboarding PTY write should not be guarded");

        registry.cancel(ONBOARDING_PTY_ID);
    }

    #[tokio::test]
    async fn discard_workspace_changes_returns_frozen_when_workspace_done() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-discard");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        let result = discard_workspace_changes_impl(&db, ws_id.clone()).await;
        assert_frozen(result, &ws_id);
    }

    // F0.2.D — reopen_workspace flips ui_status away from `done` and
    // resets the runtime status to `ready`; refuses on a non-frozen
    // workspace so a stale UI never silently retargets a live one.

    #[tokio::test]
    async fn reopen_workspace_lifts_freeze_to_target_status_and_resets_runtime() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-reopen");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);
        // Runtime status as if the workspace had truly closed out.
        {
            let conn = db.lock();
            workspaces::update_status(&conn, &ws_id, "done").unwrap();
        }

        // Reopen with `backlog` to confirm the target arg flows through
        // rather than being hardcoded.
        reopen_workspace_impl(&db, ws_id.clone(), "backlog".into())
            .await
            .unwrap();

        let conn = db.lock();
        let ws = workspaces::get(&conn, &ws_id).unwrap();
        assert_eq!(ws.ui_status, "backlog");
        assert_eq!(ws.status, "ready");
        assert!(!workspaces::is_frozen(&conn, &ws_id).unwrap());
    }

    #[tokio::test]
    async fn reopen_workspace_rejects_non_frozen_workspace() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-reopen-noop");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        // Workspace stays at ui_status='backlog' from the seed.

        let result =
            reopen_workspace_impl(&db, ws_id.clone(), "in_progress".into()).await;
        match result {
            Err(AppError::Validation(msg)) => {
                assert!(
                    msg.contains(&ws_id),
                    "expected validation message to mention the workspace id, got: {msg}"
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn reopen_workspace_rejects_frozen_states_as_target() {
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, "/tmp/freeze-reopen-self");
        let (ws_id, _) = seed_workspace_chain(&db, &repo_id);
        mark_workspace_done(&db, &ws_id);

        for target in ["done", "canceled"] {
            let result =
                reopen_workspace_impl(&db, ws_id.clone(), target.into()).await;
            match result {
                Err(AppError::Validation(msg)) => {
                    assert!(
                        msg.contains("frozen"),
                        "expected validation to call out the frozen target, got: {msg}"
                    );
                }
                other => panic!("expected Validation for target {target}, got {other:?}"),
            }
        }
    }

    fn hex_sha256(bytes: &[u8]) -> String {
        super::sha256_hex(bytes)
    }

    /// Seed a workspace whose `worktree_path` is a real on-disk directory
    /// so file_save can actually read + write through it. Returns
    /// (db, workspace_id, tempdir handle).
    fn seed_real_workspace(prefix: &str) -> (DbState, String, tempfile::TempDir) {
        let tmp = tempfile::tempdir().unwrap();
        let db = init_db_memory().unwrap();
        let repo_id = seed_repo_row(&db, &format!("/tmp/{prefix}-repo"));
        let ws_id = {
            let conn = db.lock();
            let t = Task {
                task_id: new_id(),
                repo_id: repo_id.clone(),
                title: "t".into(),
                task_text: "t".into(),
                status: "active".into(),
                created_at: now_ms(),
            };
            tasks::create(&conn, &t).unwrap();
            let ws = Workspace {
                workspace_id: new_id(),
                task_id: t.task_id.clone(),
                name: "ws-file-save".into(),
                worktree_path: tmp.path().to_string_lossy().into_owned(),
                branch_name: "agent/wip-x".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: false,
                created_at: now_ms(),
                deletion_intent: 0,
                ui_status: "backlog".into(),
                last_merge_action: None,
                sandbox_level: "L2Project".into(),
                pr_url: None,
                pr_number: None,
                pr_state: None,
            };
            workspaces::create(&conn, &ws).unwrap();
            ws.workspace_id
        };
        (db, ws_id, tmp)
    }

    #[tokio::test]
    async fn file_save_writes_when_hash_matches() {
        let (db, ws_id, tmp) = seed_real_workspace("file-save-happy");
        std::fs::write(tmp.path().join("foo.txt"), b"old").unwrap();
        let hash = hex_sha256(b"old");

        let new_hash = file_save_impl(
            &db,
            ws_id,
            "foo.txt".into(),
            "new".into(),
            hash,
        )
        .await
        .expect("save succeeds");

        let on_disk = std::fs::read_to_string(tmp.path().join("foo.txt")).unwrap();
        assert_eq!(on_disk, "new");
        assert_eq!(new_hash, hex_sha256(b"new"));
    }

    #[tokio::test]
    async fn file_save_rejects_stale_hash() {
        let (db, ws_id, tmp) = seed_real_workspace("file-save-stale");
        std::fs::write(tmp.path().join("foo.txt"), b"current").unwrap();
        // Editor's baseline was an older version.
        let stale_hash = hex_sha256(b"stale");

        let err = file_save_impl(
            &db,
            ws_id,
            "foo.txt".into(),
            "new".into(),
            stale_hash,
        )
        .await
        .expect_err("expected StaleFile");
        match err {
            AppError::StaleFile(p) => assert_eq!(p, "foo.txt"),
            other => panic!("expected StaleFile, got {other:?}"),
        }
        // On-disk untouched.
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("foo.txt")).unwrap(),
            "current"
        );
    }

    #[tokio::test]
    async fn file_save_returns_frozen_when_workspace_done() {
        let (db, ws_id, tmp) = seed_real_workspace("file-save-frozen");
        std::fs::write(tmp.path().join("foo.txt"), b"old").unwrap();
        mark_workspace_done(&db, &ws_id);
        let hash = hex_sha256(b"old");

        let result = file_save_impl(
            &db,
            ws_id.clone(),
            "foo.txt".into(),
            "new".into(),
            hash,
        )
        .await;
        assert_frozen(result, &ws_id);

        // On-disk untouched.
        assert_eq!(
            std::fs::read_to_string(tmp.path().join("foo.txt")).unwrap(),
            "old"
        );
    }

    #[tokio::test]
    async fn file_save_rejects_traversal_path() {
        let (db, ws_id, _tmp) = seed_real_workspace("file-save-traversal");
        let err = file_save_impl(
            &db,
            ws_id,
            "../etc/hosts".into(),
            "pwn".into(),
            hex_sha256(b""),
        )
        .await
        .expect_err("traversal must be rejected");
        assert!(matches!(err, AppError::Validation(_)));
    }

    fn hex_short(bytes: &[u8]) -> String {
        super::short_content_hash(bytes)
    }

    #[tokio::test]
    async fn mark_file_viewed_inserts_row_with_current_hash() {
        let (db, ws_id, tmp) = seed_real_workspace("fv-mark");
        std::fs::write(tmp.path().join("foo.ts"), b"hello").unwrap();
        mark_file_viewed_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        let conn = db.lock();
        let row = workspace_file_views::get_opt(&conn, &ws_id, "foo.ts")
            .unwrap()
            .unwrap();
        assert_eq!(row.viewed_at_hash, hex_short(b"hello"));
    }

    #[tokio::test]
    async fn list_file_views_returns_viewed_when_hash_matches() {
        let (db, ws_id, tmp) = seed_real_workspace("fv-list-viewed");
        std::fs::write(tmp.path().join("foo.ts"), b"hello").unwrap();
        mark_file_viewed_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        let out = list_file_views_impl(&db, ws_id).await.unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "foo.ts");
        assert_eq!(out[0].state, FileViewState::Viewed);
    }

    #[tokio::test]
    async fn list_file_views_flips_to_changed_when_content_changes() {
        let (db, ws_id, tmp) = seed_real_workspace("fv-list-changed");
        std::fs::write(tmp.path().join("foo.ts"), b"hello").unwrap();
        mark_file_viewed_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        // Simulate the agent (or user) modifying the file post-review.
        std::fs::write(tmp.path().join("foo.ts"), b"hello world").unwrap();
        let out = list_file_views_impl(&db, ws_id).await.unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].state, FileViewState::ChangedSinceViewed);
    }

    #[tokio::test]
    async fn list_file_views_flips_to_changed_when_file_deleted() {
        let (db, ws_id, tmp) = seed_real_workspace("fv-list-deleted");
        std::fs::write(tmp.path().join("foo.ts"), b"hello").unwrap();
        mark_file_viewed_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        std::fs::remove_file(tmp.path().join("foo.ts")).unwrap();
        let out = list_file_views_impl(&db, ws_id).await.unwrap();
        assert_eq!(out[0].state, FileViewState::ChangedSinceViewed);
    }

    #[tokio::test]
    async fn clear_file_view_removes_row() {
        let (db, ws_id, tmp) = seed_real_workspace("fv-clear");
        std::fs::write(tmp.path().join("foo.ts"), b"hello").unwrap();
        mark_file_viewed_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        clear_file_view_impl(&db, ws_id.clone(), "foo.ts".into())
            .await
            .unwrap();
        let out = list_file_views_impl(&db, ws_id).await.unwrap();
        assert!(out.is_empty());
    }

    #[tokio::test]
    async fn mark_file_viewed_rejects_traversal_path() {
        let (db, ws_id, _tmp) = seed_real_workspace("fv-traversal");
        let err = mark_file_viewed_impl(&db, ws_id, "../etc/hosts".into())
            .await
            .expect_err("traversal must be rejected");
        assert!(matches!(err, AppError::Validation(_)));
    }
}
