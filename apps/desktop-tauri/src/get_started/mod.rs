//! Phase 6 / Atom 6 — bundled "Get started" project for the tour.
//!
//! Two files (README.md + hello.js) are embedded via `include_str!`
//! and materialized to `~/Mozart/get-started/` on first call. The
//! command is idempotent : if the folder already exists as a valid
//! git repo it's reused, only the workspace creation runs.
//!
//! Lifecycle :
//! 1. Materialize folder + files.
//! 2. `git init` + initial commit (empty, from git_query::init_repo).
//! 3. `git add . && git commit` of the two starter files.
//! 4. `add_repo_impl` registers the repo in the DB (idempotent on path).
//! 5. `workspace_service::create_workspace` creates the `welcome-1`
//!    workspace on `main`.
//! 6. Return the Repo + Workspace to the front-end so the page can
//!    navigate to `/workspaces/<welcome-1.id>`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use specta::Type;

use crate::commands::add_repo_impl;
use crate::db::models::{Repo, Workspace};
use crate::db::DbState;
use crate::error::AppError;
use crate::{git_query, workspace_service};

const README: &str = include_str!("README.md");
const HELLO_JS: &str = include_str!("hello.js");

const PROJECT_FOLDER_NAME: &str = "Mozart/get-started";
const WORKSPACE_NAME: &str = "welcome-1";
const WELCOME_TASK_TEXT: &str = "Try one of the prompts in the README to see Mozart's loop end-to-end.";

/// Return type — pairs the registered repo with the auto-created
/// workspace. The TS bindings expose this as `GetStartedProject`.
#[derive(Debug, Clone, Serialize, Type)]
pub struct GetStartedProject {
    pub repo: Repo,
    pub workspace: Workspace,
}

/// Materialize the bundled project (if missing) and ensure a workspace
/// exists. Idempotent — repeated calls return the same repo /
/// workspace pair.
pub async fn create(db: &DbState) -> Result<GetStartedProject, AppError> {
    let path = target_path()?;
    materialize_files(&path).await?;
    ensure_git_repo(&path).await?;

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

async fn materialize_files(path: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(path)
        .map_err(|e| AppError::Io(format!("create get-started dir: {e}")))?;
    let readme = path.join("README.md");
    if !readme.exists() {
        std::fs::write(&readme, README)
            .map_err(|e| AppError::Io(format!("write README.md: {e}")))?;
    }
    let hello = path.join("hello.js");
    if !hello.exists() {
        std::fs::write(&hello, HELLO_JS)
            .map_err(|e| AppError::Io(format!("write hello.js: {e}")))?;
    }
    Ok(())
}

async fn ensure_git_repo(path: &Path) -> Result<(), AppError> {
    // Already a git repo? `validate_repo` returns Ok for any usable
    // repo, NotARepo when missing. Other variants we surface as-is —
    // they indicate the user has manually broken the folder.
    match git_query::validate_repo(path).await {
        Ok(()) => return Ok(()),
        Err(git_query::RepoIssue::NotARepo) => {}
        Err(other) => {
            return Err(AppError::Validation(format!(
                "get-started repo not usable: {other:?}"
            )));
        }
    }
    git_query::init_repo(path).await?;
    // Stage + commit the bundled files. The empty initial commit from
    // init_repo gives us a base branch ; this second commit gives us
    // visible content for the tour.
    run_git(path, &["add", "."])?;
    run_git(
        path,
        &[
            "commit",
            "--no-gpg-sign",
            "-m",
            "Add Mozart get-started starter files",
        ],
    )?;
    Ok(())
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<(), AppError> {
    let status = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .status()
        .map_err(|e| AppError::Io(format!("git spawn: {e}")))?;
    if !status.success() {
        return Err(AppError::Io(format!(
            "git {} failed (exit {:?})",
            args.join(" "),
            status.code()
        )));
    }
    Ok(())
}
