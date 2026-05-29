//! Orchestrator for the "Open project" silent bootstrap.
//!
//! `bootstrap_project` is the only entry point the Open-project handler
//! should call. It:
//!
//! 1. Idempotently registers the repo row (`add_repo` semantics).
//! 2. Probes the project (`detect::detect_project`).
//! 3. If `.mozart/run.json` already exists, validates it and uses that.
//! 4. Otherwise writes a `project_local_config` row with the inferred
//!    run config (the *silent local default* from
//!    `[[mozart-repo-init-principle]]`).
//! 5. Creates the first workspace via `workspace_service`.
//! 6. Creates a "Start" chat in that workspace.
//!
//! What it deliberately does NOT do:
//! - Never writes anything to `.mozart/` on disk. Repo config only
//!   appears via the explicit `init_project_repo_from_local` action.
//! - Never `git add`s anything. The repo's working tree is never touched.
//! - Never emits the chat-timeline `system_info` entry. That belongs to
//!   atom R0.3.E (the wire-up), so the entry kind in R0.3.F can be
//!   wired in isolation.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::db::models::{Chat, Repo};
use crate::db::project_local_config::ProjectLocalConfig;
use crate::db::{
    chats, new_id, now_ms, project_local_config, repos, DbState,
};
use crate::error::AppError;
use crate::git_query;
use crate::workspace_service;

use super::detect::{detect_project, ProjectDetection};
use super::dto::RunConfig;
use super::validate::validate_config;

/// Flattened detection summary for the UI surface. The internal
/// `ProjectDetection` keeps the full ordered `RunConfig`; this DTO
/// reduces it to the two strings the system_info bullet renders.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DetectedSummary {
    pub setup: Option<String>,
    pub run: Option<String>,
    /// Toolchain name from the winning probe (`"pnpm"`, `"cargo"`, ...).
    /// `None` when no probe matched.
    pub stack: Option<String>,
    pub has_mozart_dir: bool,
}

impl DetectedSummary {
    pub fn from_detection(d: &ProjectDetection) -> Self {
        Self {
            setup: d.inferred_run.get("setup").map(str::to_string),
            run: d.inferred_run.get("run").map(str::to_string),
            stack: d.package_manager.clone(),
            has_mozart_dir: d.has_mozart_dir,
        }
    }
}

/// Result of a successful bootstrap. Maps to the JSON returned by the
/// `bootstrap_project` Tauri command.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResult {
    pub project_id: String,
    pub first_workspace_id: String,
    pub start_chat_id: String,
    /// Where the run config came from:
    /// - `"repo"`:     `.mozart/run.json` was present, valid, and read.
    /// - `"local"`:    Inferred and written to `project_local_config`.
    /// - `"fallback"`: No probe matched; an empty row was still written
    ///                 so callers always find a config.
    pub source: String,
    pub detected: DetectedSummary,
    /// If detection produced a setup command, bootstrap also writes a
    /// `setup_progress` timeline entry in the running state. The frontend
    /// transitions this entry to `done` / `failed` after `runInstall`
    /// resolves. `None` when no setup command was detected.
    pub setup_progress_message_id: Option<String>,
}

/// Where merged config came from for read-time consumers. Mirrors
/// `BootstrapResult.source` minus `"fallback"` (fallback rows are stored
/// in the local DB and read back as `"local"`).
///
/// `run_json` is the raw JSON text the frontend parses — keeps the
/// `.mozart/run.json` key order intact through the FFI without having
/// to teach `specta::Type` about the ordered-Vec representation.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub run_json: String,
    pub merge_mode: String,
    /// `"repo"` or `"local"`.
    pub source: String,
}

const DEFAULT_MERGE_MODE: &str = "pr";
const DEFAULT_FIRST_TASK_TEXT: &str = "Project ready";
const START_CHAT_TITLE: &str = "Start";

/// Workspace-name pool — mirrors the frontend `WORKSPACE_NAME_POOL`
/// (libs/desktop-workspaces-util/util-workspace-name.ts) so the very
/// first workspace created by bootstrap gets the same kind of random
/// artist name as every later one created via `createForPrompt`.
const WORKSPACE_NAME_POOL: &[&str] = &[
    "pavarotti", "callas", "sinatra", "aretha", "elvis", "bowie", "mercury",
    "jackson", "marley", "eminem", "coltrane", "davis", "hendrix", "prince",
    "lennon", "dylan", "beyonce", "madonna", "bjork", "aznavour", "piaf",
    "gainsbourg", "daft-punk", "beethoven", "chopin", "tupac", "kendrick",
    "whitney", "billie", "stevie",
];

/// Run the bootstrap orchestration. Atom R0.3.G's guard lives here so
/// the invariant holds at the backend boundary — a devtools-fed bad
/// path can't sneak past the frontend check.
pub async fn bootstrap_project(
    db: &DbState,
    path: &Path,
) -> Result<BootstrapResult, AppError> {
    // R0.3.G — path must be a real, readable directory. Bail before any
    // DB writes so the failure leaves dashboard state untouched.
    validate_open_path(path)?;
    let canonical = canonicalize_or_keep(path);
    let path_str = canonical.to_string_lossy().into_owned();

    // 1. Register or fetch the repo row. Idempotent.
    let project_id = upsert_repo_row(db, &canonical, &path_str).await?;

    // 2. Probe.
    let detection = detect_project(&canonical).await;

    // 3. Decide source + persist if local.
    let source = resolve_config_source(db, &project_id, &canonical, &detection)?;

    // 4. First workspace. base_branch resolved here so bootstrap is
    //    a single Tauri call from the UI side.
    let base_branch = resolve_base_branch(&canonical).await?;
    let workspace_name = pick_first_workspace_name();
    let ws = workspace_service::create_workspace(
        db,
        &project_id,
        &canonical,
        &base_branch,
        DEFAULT_FIRST_TASK_TEXT,
        &workspace_name,
    )
    .await?;

    // 5. Start chat. The first "ready" surface — branch line + setup
    //    status + start-chatting CTA — is rendered live by the chat
    //    empty-state from the workspace + install state. Bootstrap no
    //    longer persists `system_info` / `setup_progress` timeline
    //    cards, so the manual "open project" flow and the generated-
    //    workspace flow (`createForPrompt`) show the exact same screen.
    let chat = create_start_chat(db, &ws.workspace_id)?;

    let detected = DetectedSummary::from_detection(&detection);

    Ok(BootstrapResult {
        project_id,
        first_workspace_id: ws.workspace_id,
        start_chat_id: chat.chat_id,
        source,
        detected,
        // Retained for wire compatibility; the timeline card it used to
        // reference was removed in favor of the live empty-state.
        setup_progress_message_id: None,
    })
}

async fn upsert_repo_row(
    db: &DbState,
    canonical: &Path,
    path_str: &str,
) -> Result<String, AppError> {
    // Refuse non-git up front so the workspace step doesn't error
    // mid-way through. Mirrors `add_repo`'s gating.
    if let Err(issue) = git_query::validate_repo(canonical).await {
        return Err(match issue {
            git_query::RepoIssue::NotARepo => AppError::Validation("NotARepo".into()),
            other => AppError::Validation(format!("repo not usable: {other:?}")),
        });
    }
    let conn = db.lock();
    if let Ok(existing) = repos::get_by_path(&conn, path_str) {
        return Ok(existing.repo_id);
    }
    let display_name = canonical
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path_str.to_string());
    let repo = Repo {
        repo_id: new_id(),
        path: path_str.to_string(),
        display_name,
        added_at: now_ms(),
        icon: None,
        hidden: false,
        sort_index: 0,
        run_command: None,
        setup_command: None,
    };
    repos::create(&conn, &repo)?;
    Ok(repo.repo_id)
}

fn resolve_config_source(
    db: &DbState,
    project_id: &str,
    canonical: &Path,
    detection: &ProjectDetection,
) -> Result<String, AppError> {
    if detection.has_mozart_dir {
        // Read repo config inline — surfaces validation errors *now*
        // rather than at first agent run. If the file is missing or
        // unreadable we fall through to writing a local row.
        if let Ok(cfg) = read_repo_run_json(canonical) {
            validate_config(&cfg)?;
            return Ok("repo".into());
        }
    }

    let now = now_ms();
    let run_json = serde_json::to_string(&detection.inferred_run)
        .map_err(|e| AppError::Validation(format!("serialize run.json: {e}")))?;
    let row = ProjectLocalConfig {
        project_id: project_id.to_string(),
        run_json,
        merge_mode: DEFAULT_MERGE_MODE.into(),
        created_at: now,
        updated_at: now,
    };
    let conn = db.lock();
    project_local_config::upsert(&conn, &row)?;

    Ok(if detection.inferred_run.scripts.is_empty() {
        "fallback".into()
    } else {
        "local".into()
    })
}

fn read_repo_run_json(root: &Path) -> Result<serde_json::Value, AppError> {
    let body = std::fs::read_to_string(root.join(".mozart").join("run.json"))?;
    serde_json::from_str(&body)
        .map_err(|e| AppError::Validation(format!(".mozart/run.json parse: {e}")))
}

async fn resolve_base_branch(root: &Path) -> Result<String, AppError> {
    let branches = git_query::list_branches(root).await?;
    if branches.iter().any(|b| b == "main") {
        return Ok("main".into());
    }
    branches
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Validation("project has no branches".into()))
}

fn pick_first_workspace_name() -> String {
    // Random pick from the artist pool. Uniqueness within a project
    // isn't a concern here — this is always the very first workspace,
    // so every pool entry is free. `now_ms()` is a dependency-free
    // entropy source good enough for picking a label.
    let idx = (now_ms() as usize) % WORKSPACE_NAME_POOL.len();
    WORKSPACE_NAME_POOL[idx].to_string()
}

fn create_start_chat(db: &DbState, workspace_id: &str) -> Result<Chat, AppError> {
    let chat = Chat {
        chat_id: new_id(),
        workspace_id: workspace_id.to_string(),
        title: START_CHAT_TITLE.into(),
        llm_id: None,
        mode: "agent".into(),
        effort: "medium".into(),
        last_read_message_id: None,
        closed_at: None,
        created_at: now_ms(),
    };
    let conn = db.lock();
    chats::create(&conn, &chat)?;
    Ok(chat)
}

fn canonicalize_or_keep(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// R0.3.G's guard. Refuses anything that isn't a real directory we can
/// list. Error strings are kept stable so the UI can route them through
/// the bootstrap toast template `Couldn't open <basename>. <reason>.`
fn validate_open_path(path: &Path) -> Result<(), AppError> {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::Validation(format!(
                "path does not exist: {}",
                path.display()
            )));
        }
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err(AppError::Validation(format!(
                "permission denied reading {}",
                path.display()
            )));
        }
        Err(e) => {
            return Err(AppError::Validation(format!(
                "cannot stat {}: {e}",
                path.display()
            )));
        }
    };
    if !meta.is_dir() {
        return Err(AppError::Validation(format!(
            "path is not a directory: {}",
            path.display()
        )));
    }
    // Probe readability by trying to open it as a directory. Catches
    // exec-only mode bits and other "directory but not listable" cases.
    std::fs::read_dir(path).map_err(|e| {
        AppError::Validation(format!("cannot read directory {}: {e}", path.display()))
    })?;
    Ok(())
}

/// Write the local fallback config out to `.mozart/run.json` (and a
/// minimal `.mozart/settings.json`). Validates before writing, refuses
/// to overwrite an existing `.mozart/*` file. Wired but not exposed in
/// UI for v0 (TODO-006).
pub async fn init_project_repo_from_local(
    db: &DbState,
    project_id: &str,
) -> Result<(), AppError> {
    let (repo_path, run_json) = {
        let conn = db.lock();
        let repo = repos::get(&conn, project_id)?;
        let local = project_local_config::get(&conn, project_id)?;
        (repo.path, local.run_json)
    };

    // Validate first.
    let parsed: serde_json::Value = serde_json::from_str(&run_json)
        .map_err(|e| AppError::Validation(format!("run_json parse: {e}")))?;
    validate_config(&parsed)?;

    let mozart_dir = PathBuf::from(&repo_path).join(".mozart");
    let run_path = mozart_dir.join("run.json");
    let settings_path = mozart_dir.join("settings.json");

    if run_path.exists() {
        return Err(AppError::Validation(format!(
            ".mozart/run.json already exists at {} — refusing to overwrite",
            run_path.display()
        )));
    }
    if settings_path.exists() {
        return Err(AppError::Validation(format!(
            ".mozart/settings.json already exists at {} — refusing to overwrite",
            settings_path.display()
        )));
    }

    tokio::fs::create_dir_all(&mozart_dir).await?;
    let settings_body = serde_json::to_string_pretty(
        &serde_json::json!({ "version": "0.1" }),
    )
    .map_err(|e| AppError::Validation(format!("serialize settings.json: {e}")))?;
    tokio::fs::write(&settings_path, settings_body).await?;
    let pretty_run = serde_json::to_string_pretty(&parsed)
        .map_err(|e| AppError::Validation(format!("pretty run.json: {e}")))?;
    tokio::fs::write(&run_path, pretty_run).await?;

    Ok(())
}

/// Read the active config for `project_id`. If `.mozart/run.json` exists
/// and validates, returns it with `source = "repo"`. Otherwise returns
/// the local row with `source = "local"`. `merge_mode` always comes
/// from the local row (it never appears in repo files).
pub fn read_project_config(
    db: &DbState,
    project_id: &str,
) -> Result<ProjectConfig, AppError> {
    let (repo_path, local) = {
        let conn = db.lock();
        let repo = repos::get(&conn, project_id)?;
        let local = project_local_config::get_opt(&conn, project_id)?;
        (repo.path, local)
    };

    let merge_mode = local
        .as_ref()
        .map(|l| l.merge_mode.clone())
        .unwrap_or_else(|| DEFAULT_MERGE_MODE.to_string());

    let run_path = PathBuf::from(&repo_path).join(".mozart").join("run.json");
    if run_path.is_file() {
        let body = std::fs::read_to_string(&run_path)?;
        let parsed: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| AppError::Validation(format!(".mozart/run.json parse: {e}")))?;
        validate_config(&parsed)?;
        // Round-trip through RunConfig so key order is normalized and
        // any duplicate-key error fires at read time.
        let run: RunConfig = serde_json::from_value(parsed)
            .map_err(|e| AppError::Validation(format!(".mozart/run.json shape: {e}")))?;
        let run_json = serde_json::to_string(&run)
            .map_err(|e| AppError::Validation(format!("serialize repo run.json: {e}")))?;
        return Ok(ProjectConfig {
            run_json,
            merge_mode,
            source: "repo".into(),
        });
    }

    let local = local
        .ok_or_else(|| AppError::NotFound(format!("no config for project_id={project_id}")))?;
    let parsed: serde_json::Value = serde_json::from_str(&local.run_json)
        .map_err(|e| AppError::Validation(format!("local run_json parse: {e}")))?;
    validate_config(&parsed)?;
    // Same normalization path as above.
    let run: RunConfig = serde_json::from_value(parsed)
        .map_err(|e| AppError::Validation(format!("local run_json shape: {e}")))?;
    let run_json = serde_json::to_string(&run)
        .map_err(|e| AppError::Validation(format!("serialize local run.json: {e}")))?;
    Ok(ProjectConfig {
        run_json,
        merge_mode,
        source: "local".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_db_memory, project_local_config as plc, repos};
    use crate::sandbox::{git_available, test_env_gate};
    use std::process::Command;
    use tempfile::TempDir;

    fn init_git_repo(repo: &Path) {
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
            .args(["add", "seed.txt"])
            .output()
            .expect("git add");
        assert!(s.status.success());
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--no-gpg-sign", "-m", "seed"])
            .output()
            .expect("git commit");
        assert!(s.status.success());
    }

    fn restore_root(prev: Option<std::ffi::OsString>) {
        match prev {
            Some(v) => std::env::set_var("MOZART_WORKTREES_ROOT", v),
            None => std::env::remove_var("MOZART_WORKTREES_ROOT"),
        }
    }

    fn worktree_status_is_clean(repo: &Path) -> (bool, String) {
        let out = Command::new("git")
            .current_dir(repo)
            .args(["status", "--porcelain"])
            .output()
            .expect("git status");
        let txt = String::from_utf8_lossy(&out.stdout).into_owned();
        (txt.trim().is_empty(), txt)
    }

    /// e2e #1 from the spec — bootstrap on a repo with no `.mozart/`.
    /// Asserts: project row exists, workspace exists, Start chat exists,
    /// project_local_config row written, source="local",
    /// `git status` on the user's repo stays clean.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn bootstrap_no_mozart_writes_local_row() {
        if !git_available() {
            eprintln!("SKIP bootstrap_no_mozart_writes_local_row: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);
        std::fs::write(
            repo.join("package.json"),
            r#"{ "scripts": { "dev": "vite", "build": "vite build" } }"#,
        )
        .unwrap();
        std::fs::write(repo.join("pnpm-workspace.yaml"), "packages:\n  - .\n").unwrap();
        // Stage and commit the new manifests so the worktree stays clean
        // for the post-bootstrap status check.
        for f in ["package.json", "pnpm-workspace.yaml"] {
            Command::new("git").current_dir(&repo).args(["add", f]).output().unwrap();
        }
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "manifests"])
            .output()
            .unwrap();

        let db = init_db_memory().unwrap();
        let result = bootstrap_project(&db, &repo).await.expect("bootstrap ok");

        assert_eq!(result.source, "local");
        assert_eq!(result.detected.stack.as_deref(), Some("pnpm"));
        assert_eq!(result.detected.setup.as_deref(), Some("pnpm install"));
        assert_eq!(result.detected.run.as_deref(), Some("pnpm dev"));
        assert!(!result.detected.has_mozart_dir);

        let conn = db.lock();
        let repo_row = repos::get(&conn, &result.project_id).expect("repo row exists");
        assert!(!repo_row.display_name.is_empty());
        let local = plc::get(&conn, &result.project_id).expect("local config row written");
        assert!(
            local.run_json.contains("pnpm install"),
            "run_json should carry the inferred setup, got {}",
            local.run_json
        );
        assert_eq!(local.merge_mode, "pr");
        // Workspace exists.
        let _ws = crate::db::workspaces::get(&conn, &result.first_workspace_id)
            .expect("workspace row exists");
        // Start chat exists with title "Start".
        let chat = crate::db::chats::get(&conn, &result.start_chat_id).expect("chat exists");
        assert_eq!(chat.title, "Start");
        drop(conn);

        // The user's repo working tree must stay clean — no .mozart/, no
        // stray files. This is the load-bearing invariant for P0.3.
        assert!(
            !repo.join(".mozart").exists(),
            "bootstrap must not create .mozart/ on disk"
        );
        let (clean, txt) = worktree_status_is_clean(&repo);
        assert!(clean, "expected clean worktree, got:\n{txt}");

        // Bootstrap no longer persists system_info / setup_progress
        // timeline cards — the live chat empty-state renders the branch
        // line + setup status instead, so the Start chat stays empty.
        assert!(
            result.setup_progress_message_id.is_none(),
            "timeline card was removed; expected no setup_progress id"
        );

        restore_root(prev);
    }

    /// e2e #2 — bootstrap when the repo already carries `.mozart/run.json`.
    /// Asserts: source="repo", no local row written, files left untouched.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn bootstrap_with_existing_mozart_dir_reads_repo() {
        if !git_available() {
            eprintln!("SKIP bootstrap_with_existing_mozart_dir_reads_repo: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);

        std::fs::create_dir_all(repo.join(".mozart")).unwrap();
        std::fs::write(
            repo.join(".mozart/run.json"),
            r#"{ "scripts": { "setup": "make setup", "run": "make dev" } }"#,
        )
        .unwrap();
        // Commit so the worktree is clean.
        Command::new("git")
            .current_dir(&repo)
            .args(["add", ".mozart/run.json"])
            .output()
            .unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "mozart config"])
            .output()
            .unwrap();

        let db = init_db_memory().unwrap();
        let result = bootstrap_project(&db, &repo).await.expect("bootstrap ok");

        assert_eq!(result.source, "repo");
        assert!(result.detected.has_mozart_dir);

        let conn = db.lock();
        // No local-config row when the repo carries config.
        let local = plc::get_opt(&conn, &result.project_id).expect("query ok");
        assert!(local.is_none(), "no local row should be written when source=repo");
        drop(conn);

        // Repo's .mozart/run.json must be untouched.
        let body = std::fs::read_to_string(repo.join(".mozart/run.json")).unwrap();
        assert!(body.contains("make setup"));
        let (clean, txt) = worktree_status_is_clean(&repo);
        assert!(clean, "expected clean worktree, got:\n{txt}");

        restore_root(prev);
    }

    /// e2e #3 — detection finds nothing → source="fallback", empty run_json,
    /// project_local_config row still written.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn bootstrap_fallback_when_no_probe_matches() {
        if !git_available() {
            eprintln!("SKIP bootstrap_fallback_when_no_probe_matches: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);
        // Just a README — no manifests, no Makefile.
        std::fs::write(repo.join("README.md"), "# only readme").unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["add", "README.md"])
            .output()
            .unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "readme"])
            .output()
            .unwrap();

        let db = init_db_memory().unwrap();
        let result = bootstrap_project(&db, &repo).await.expect("bootstrap ok");

        assert_eq!(result.source, "fallback");
        assert_eq!(result.detected.stack, None);
        assert_eq!(result.detected.setup, None);
        assert_eq!(result.detected.run, None);

        let conn = db.lock();
        let local = plc::get(&conn, &result.project_id).expect("fallback row still written");
        assert_eq!(local.run_json, r#"{"scripts":{}}"#);
        drop(conn);

        // Timeline cards were removed — no setup_progress id regardless
        // of detection outcome.
        assert!(
            result.setup_progress_message_id.is_none(),
            "no setup_progress entry is ever planted now"
        );

        restore_root(prev);
    }

    /// e2e #4 — detect_project on its own (the "detect-only" Tauri command).
    /// Pure-read; never touches DB or filesystem outside the probe target.
    #[tokio::test]
    async fn detect_only_does_not_touch_db_or_disk() {
        let tmp = TempDir::new().unwrap();
        std::fs::write(tmp.path().join("go.mod"), "module x\n").unwrap();
        let d = crate::mozart_config::detect::detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("go"));
        // Caller-side smoke: there is no DB to corrupt because we never
        // touched one. The detector is stateless.
    }

    /// REGRESSION-risk invariant from the spec: refuses to overwrite an
    /// existing `.mozart/*` file.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn init_repo_refuses_overwrite() {
        if !git_available() {
            eprintln!("SKIP init_repo_refuses_overwrite: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);
        // Bootstrap into a local row.
        std::fs::write(
            repo.join("package.json"),
            r#"{ "scripts": { "dev": "vite" } }"#,
        )
        .unwrap();
        Command::new("git").current_dir(&repo).args(["add", "package.json"]).output().unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "pkg"])
            .output()
            .unwrap();
        let db = init_db_memory().unwrap();
        let r = bootstrap_project(&db, &repo).await.expect("bootstrap ok");
        // Pre-seed an existing .mozart/run.json so the next call collides.
        std::fs::create_dir_all(repo.join(".mozart")).unwrap();
        std::fs::write(repo.join(".mozart/run.json"), "{\"scripts\":{}}").unwrap();

        let err = init_project_repo_from_local(&db, &r.project_id)
            .await
            .expect_err("should refuse to overwrite");
        let msg = match err {
            AppError::Validation(m) => m,
            other => panic!("expected Validation, got {other:?}"),
        };
        assert!(msg.contains("refusing to overwrite"), "got: {msg}");
        // The pre-existing body is untouched.
        let body = std::fs::read_to_string(repo.join(".mozart/run.json")).unwrap();
        assert_eq!(body, "{\"scripts\":{}}");

        restore_root(prev);
    }

    /// `init_project_repo_from_local` happy path — writes run.json +
    /// settings.json with the local row's contents.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn init_repo_writes_files() {
        if !git_available() {
            eprintln!("SKIP init_repo_writes_files: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);
        std::fs::write(repo.join("go.mod"), "module x\n").unwrap();
        Command::new("git").current_dir(&repo).args(["add", "go.mod"]).output().unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "go"])
            .output()
            .unwrap();
        let db = init_db_memory().unwrap();
        let r = bootstrap_project(&db, &repo).await.expect("bootstrap ok");

        init_project_repo_from_local(&db, &r.project_id)
            .await
            .expect("init repo ok");

        let run_body = std::fs::read_to_string(repo.join(".mozart/run.json")).unwrap();
        let settings_body = std::fs::read_to_string(repo.join(".mozart/settings.json")).unwrap();
        assert!(run_body.contains("go mod download"));
        assert!(run_body.contains("go run ."));
        assert!(settings_body.contains("\"version\""));
        assert!(settings_body.contains("0.1"));

        restore_root(prev);
    }

    /// R0.3.G guard — bootstrap on a path that doesn't exist must
    /// refuse before any DB writes. Project / workspace / chat tables
    /// stay empty.
    #[tokio::test]
    async fn bootstrap_refuses_missing_path_without_side_effects() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let root = TempDir::new().unwrap();
        let bogus = root.path().join("does-not-exist");
        let db = init_db_memory().unwrap();

        let err = bootstrap_project(&db, &bogus)
            .await
            .expect_err("missing path must refuse");
        match err {
            AppError::Validation(msg) => {
                assert!(
                    msg.contains("path does not exist"),
                    "expected missing-path message, got: {msg}"
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
        let conn = db.lock();
        let n_repos: i64 = conn
            .query_row("SELECT COUNT(*) FROM repos", [], |r| r.get(0))
            .unwrap();
        let n_ws: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |r| r.get(0))
            .unwrap();
        let n_chats: i64 = conn
            .query_row("SELECT COUNT(*) FROM chats", [], |r| r.get(0))
            .unwrap();
        let n_local: i64 = conn
            .query_row("SELECT COUNT(*) FROM project_local_config", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            (n_repos, n_ws, n_chats, n_local),
            (0, 0, 0, 0),
            "no side effects allowed on guard failure"
        );
    }

    /// Guard rejects a path that exists but is a file, not a directory.
    #[tokio::test]
    async fn bootstrap_refuses_file_path() {
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let root = TempDir::new().unwrap();
        let f = root.path().join("regular.txt");
        std::fs::write(&f, "hello").unwrap();
        let db = init_db_memory().unwrap();

        let err = bootstrap_project(&db, &f)
            .await
            .expect_err("file path must refuse");
        if let AppError::Validation(msg) = err {
            assert!(msg.contains("not a directory"), "got: {msg}");
        } else {
            panic!("expected Validation");
        }
    }

    /// `read_project_config` — repo wins over local when `.mozart/` is present.
    #[allow(clippy::await_holding_lock)]
    #[tokio::test]
    async fn read_config_prefers_repo_over_local() {
        if !git_available() {
            eprintln!("SKIP read_config_prefers_repo_over_local: git not on PATH");
            return;
        }
        let _gate = test_env_gate().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var_os("MOZART_WORKTREES_ROOT");

        let root = TempDir::new().unwrap();
        // MOZART_WORKTREES_ROOT must be a *sibling* dir, not an ancestor
        // of `repo`, or the worktree creator would drop the worktree
        // inside the repo's working tree (showing up as `?? get-started/`).
        let worktrees = root.path().join("worktrees");
        std::fs::create_dir_all(&worktrees).unwrap();
        std::env::set_var("MOZART_WORKTREES_ROOT", &worktrees);
        let repo = root.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);
        std::fs::write(repo.join("go.mod"), "module x\n").unwrap();
        Command::new("git").current_dir(&repo).args(["add", "go.mod"]).output().unwrap();
        Command::new("git")
            .current_dir(&repo)
            .args(["commit", "--no-gpg-sign", "-m", "go"])
            .output()
            .unwrap();
        let db = init_db_memory().unwrap();
        let r = bootstrap_project(&db, &repo).await.expect("bootstrap ok");

        // Local row has go defaults. Now drop a different repo config
        // — read_project_config should report that one instead.
        std::fs::create_dir_all(repo.join(".mozart")).unwrap();
        std::fs::write(
            repo.join(".mozart/run.json"),
            r#"{ "scripts": { "run": "make special" } }"#,
        )
        .unwrap();

        let cfg = read_project_config(&db, &r.project_id).expect("read ok");
        assert_eq!(cfg.source, "repo");
        assert!(cfg.run_json.contains("make special"), "got {}", cfg.run_json);
        assert!(!cfg.run_json.contains("go run"));

        restore_root(prev);
    }
}

