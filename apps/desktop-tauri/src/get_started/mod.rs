//! Bundled "Get started" project for the onboarding tour.
//!
//! On first call, shallow-clones the template repo from GitHub into the
//! projects root (`get-started/`) and registers it as a Mozart project.
//! Idempotent — repeated calls reuse the existing clone + repo row.
//! The first workspace is created frontend-side via the normal
//! `createForPrompt` path (generated name + auto-install).
//!
//! The template URL is fixed at build time but can be overridden via
//! the `MOZART_GET_STARTED_URL` env var for testing alternative
//! templates / forks.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use specta::Type;

use crate::commands::add_repo_impl;
use crate::db::models::Repo;
use crate::db::DbState;
use crate::error::AppError;
use crate::git_query;
use crate::platform::NoWindow;

const TEMPLATE_URL: &str = "https://github.com/t1m4lc/mozart-get-started.git";

/// Return type — the registered repo for the bundled "Get started"
/// project. The TS bindings expose this as `GetStartedProject`. The
/// first workspace is created frontend-side via the normal
/// `createForPrompt` path so it gets a generated name + auto-install.
#[derive(Debug, Clone, Serialize, Type)]
pub struct GetStartedProject {
    pub repo: Repo,
}

/// Clone the template (if missing) and register it as a Mozart project.
/// Idempotent — repeated calls reuse the existing clone + repo row.
pub async fn create(db: &DbState) -> Result<GetStartedProject, AppError> {
    let path = target_path()?;
    ensure_template(&path).await?;

    let path_string = path
        .to_str()
        .ok_or_else(|| AppError::Io("get-started path not utf-8".into()))?
        .to_string();
    let repo = add_repo_impl(db, path_string).await?;

    Ok(GetStartedProject { repo })
}

fn target_path() -> Result<PathBuf, AppError> {
    crate::paths::get_started_dir()
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
        .no_window()
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
