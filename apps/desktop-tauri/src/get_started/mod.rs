//! Bundled "Get started" project for the onboarding tour.
//!
//! On first call, shallow-clones the template repo from GitHub into
//! `~/Mozart/get-started/` and wires it as a Mozart project with a
//! `welcome-1` workspace on `main`. Idempotent — repeated calls reuse
//! the existing clone + workspace pair.
//!
//! The template URL is fixed at build time but can be overridden via
//! the `MOZART_GET_STARTED_URL` env var for testing alternative
//! templates / forks.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use specta::Type;

use crate::commands::add_repo_impl;
use crate::db::models::{Repo, Workspace};
use crate::db::DbState;
use crate::error::AppError;
use crate::{git_query, workspace_service};

const TEMPLATE_URL: &str = "https://github.com/t1m4lc/mozart-get-started.git";
const PROJECT_FOLDER_NAME: &str = "Mozart/get-started";
const WORKSPACE_NAME: &str = "welcome-1";
const WELCOME_TASK_TEXT: &str =
    "Play the orchestra — follow the prompts in the README to grow the cast and remix the loop.";

/// Return type — pairs the registered repo with the auto-created
/// workspace. The TS bindings expose this as `GetStartedProject`.
#[derive(Debug, Clone, Serialize, Type)]
pub struct GetStartedProject {
    pub repo: Repo,
    pub workspace: Workspace,
}

/// Clone the template (if missing) and ensure a workspace exists.
/// Idempotent — repeated calls return the same repo / workspace pair.
pub async fn create(db: &DbState) -> Result<GetStartedProject, AppError> {
    let path = target_path()?;
    ensure_template(&path).await?;

    let path_string = path
        .to_str()
        .ok_or_else(|| AppError::Io("get-started path not utf-8".into()))?
        .to_string();
    let repo = add_repo_impl(db, path_string).await?;

    // Reuse an existing workspace named welcome-1 in this repo if any,
    // else create one. Keeps the tour re-entrant after the user
    // finishes once (Settings -> Revisit tour).
    let existing = {
        let conn = db.lock();
        let tasks = crate::db::tasks::list_by_repo(&conn, &repo.repo_id)?;
        let mut found: Option<Workspace> = None;
        for task in tasks {
            let by_task = crate::db::workspaces::list_by_task(&conn, &task.task_id)?;
            if let Some(w) = by_task.into_iter().find(|w| w.name == WORKSPACE_NAME) {
                found = Some(w);
                break;
            }
        }
        found
    };
    let workspace = if let Some(w) = existing {
        w
    } else {
        workspace_service::create_workspace(
            db,
            &repo.repo_id,
            &path,
            "main",
            WELCOME_TASK_TEXT,
            WORKSPACE_NAME,
        )
        .await?
    };

    Ok(GetStartedProject { repo, workspace })
}

fn target_path() -> Result<PathBuf, AppError> {
    let home = home_dir_or_cwd();
    Ok(home.join(PROJECT_FOLDER_NAME))
}

fn home_dir_or_cwd() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.is_empty() {
            return PathBuf::from(profile);
        }
    }
    PathBuf::from(".")
}

fn template_url() -> String {
    std::env::var("MOZART_GET_STARTED_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| TEMPLATE_URL.to_string())
}

/// Make sure `path` is a usable clone of the template.
///
/// - Folder missing → fresh `git clone --depth=1`.
/// - Folder exists and validates as a git repo → reuse (idempotent ;
///   the existing clone is whatever the user has, including their
///   local edits — Mozart never overwrites it).
/// - Folder exists but is NOT a git repo → return a clear error so
///   the user knows their on-disk state needs cleanup.
async fn ensure_template(path: &Path) -> Result<(), AppError> {
    if path.exists() {
        match git_query::validate_repo(path).await {
            Ok(()) => return Ok(()),
            Err(git_query::RepoIssue::NotARepo) => {
                return Err(AppError::Validation(format!(
                    "{} exists but is not a git repo — move or delete it and retry",
                    path.display()
                )));
            }
            Err(other) => {
                return Err(AppError::Validation(format!(
                    "get-started clone unusable: {other:?}"
                )));
            }
        }
    }

    let parent = path
        .parent()
        .ok_or_else(|| AppError::Io("get-started target has no parent dir".into()))?;
    std::fs::create_dir_all(parent)
        .map_err(|e| AppError::Io(format!("create parent dir: {e}")))?;

    let url = template_url();
    let status = Command::new("git")
        .arg("clone")
        .arg("--depth=1")
        .arg(&url)
        .arg(path)
        .status()
        .map_err(|e| AppError::Io(format!("git clone spawn: {e}")))?;

    if !status.success() {
        // Tear down a partial clone so the next retry doesn't see a
        // bogus directory and hit the "not a git repo" branch above.
        let _ = std::fs::remove_dir_all(path);
        return Err(AppError::Io(format!(
            "git clone {} failed (exit {:?}). Check your network and that the template repo is reachable.",
            url,
            status.code()
        )));
    }
    Ok(())
}
