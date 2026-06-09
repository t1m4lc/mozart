//! Single source of truth for every filesystem location Mozart owns.
//!
//! Everything the app writes derives from here, so there is exactly one
//! place that decides "where does Mozart's data live". Locations follow
//! the standard per-OS conventions under a clean, user-visible `Mozart`
//! folder. This name is deliberately decoupled from the reverse-DNS Tauri
//! bundle identifier (`build.mozart.desktop`, kept stable for code
//! signing / updater / deep-link): no code reads Tauri's `app_data_dir()`
//! directly, so Mozart's own data folder can carry a friendlier name.
//!
//! - **data**   — Linux `$XDG_DATA_HOME` / `~/.local/share`, macOS
//!   `~/Library/Application Support`, Windows `%APPDATA%`.
//! - **config** — Linux `$XDG_CONFIG_HOME` / `~/.config`, macOS
//!   `~/Library/Application Support`, Windows `%APPDATA%`.
//! - **cache**  — Linux `$XDG_CACHE_HOME` / `~/.cache`, macOS
//!   `~/Library/Caches`, Windows `%LOCALAPPDATA%`.
//!
//! Resolution is hand-rolled on `std` + `cfg` (mirroring `bin/seed_demo.rs`)
//! to avoid a `dirs` dependency and keep these functions pure / sync /
//! testable. Env seams override the OS defaults: `MOZART_DATA_DIR`,
//! `MOZART_CONFIG_DIR`, `MOZART_CACHE_DIR` for the roots; `MOZART_DB_PATH`
//! and `MOZART_WORKTREES_ROOT` for the two long-standing test overrides.

use std::path::PathBuf;

use crate::error::AppError;

/// Name of Mozart's per-user data folder under each OS base dir. Kept
/// friendly and user-visible (`Mozart`) rather than the reverse-DNS Tauri
/// bundle identifier — see the module doc for why this decoupling is safe.
pub const DATA_DIR_NAME: &str = "Mozart";

fn home() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

#[cfg(target_os = "linux")]
fn xdg_or(var: &str, fallback: &[&str]) -> Option<PathBuf> {
    std::env::var_os(var)
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| home().map(|h| fallback.iter().fold(h, |acc, seg| acc.join(seg))))
}

fn os_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        xdg_or("XDG_DATA_HOME", &[".local", "share"])
    }
    #[cfg(target_os = "macos")]
    {
        home().map(|h| h.join("Library").join("Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from).or_else(home)
    }
}

fn os_config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        xdg_or("XDG_CONFIG_HOME", &[".config"])
    }
    #[cfg(not(target_os = "linux"))]
    {
        os_data_dir()
    }
}

fn os_cache_dir() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        xdg_or("XDG_CACHE_HOME", &[".cache"])
    }
    #[cfg(target_os = "macos")]
    {
        home().map(|h| h.join("Library").join("Caches"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(home)
    }
}

fn rooted(env: &str, os: impl FnOnce() -> Option<PathBuf>) -> Result<PathBuf, AppError> {
    if let Some(o) = std::env::var_os(env) {
        return Ok(PathBuf::from(o));
    }
    os()
        .map(|d| d.join(DATA_DIR_NAME))
        .ok_or_else(|| AppError::Validation(format!("could not resolve a base dir (set {env})")))
}

/// Per-user data root: `<os-data>/Mozart`. Holds the DB, projects, and
/// workspaces. Override with `MOZART_DATA_DIR`.
pub fn data_dir() -> Result<PathBuf, AppError> {
    rooted("MOZART_DATA_DIR", os_data_dir)
}

/// Per-user config root: `<os-config>/Mozart`. Holds the editable global
/// `settings.json`. Override with `MOZART_CONFIG_DIR`.
pub fn config_dir() -> Result<PathBuf, AppError> {
    rooted("MOZART_CONFIG_DIR", os_config_dir)
}

/// Per-user cache root: `<os-cache>/Mozart`. Holds derived, safe-to-delete
/// files (the chime). Override with `MOZART_CACHE_DIR`.
pub fn cache_dir() -> Result<PathBuf, AppError> {
    rooted("MOZART_CACHE_DIR", os_cache_dir)
}

/// SQLite database file. `MOZART_DB_PATH` overrides the full path.
pub fn db_path() -> Result<PathBuf, AppError> {
    if let Some(o) = std::env::var_os("MOZART_DB_PATH") {
        return Ok(PathBuf::from(o));
    }
    Ok(data_dir()?.join("mozart.db"))
}

/// Root under which every workspace's git worktree lives. The legacy test
/// seam `MOZART_WORKTREES_ROOT` points here directly.
pub fn workspaces_root() -> Result<PathBuf, AppError> {
    if let Some(o) = std::env::var_os("MOZART_WORKTREES_ROOT") {
        return Ok(PathBuf::from(o));
    }
    Ok(data_dir()?.join("workspaces"))
}

/// Root under which registered project clones live. When the test seam
/// `MOZART_WORKTREES_ROOT` is set, this is derived from its parent so the
/// two roots stay siblings (mirrors the pre-`paths.rs` behaviour).
pub fn projects_root() -> Result<PathBuf, AppError> {
    if let Some(o) = std::env::var_os("MOZART_WORKTREES_ROOT") {
        let wt = PathBuf::from(o);
        return wt
            .parent()
            .map(|p| p.join("projects"))
            .ok_or_else(|| AppError::Validation("MOZART_WORKTREES_ROOT has no parent".into()));
    }
    Ok(data_dir()?.join("projects"))
}

/// Root of the pre-`paths.rs` legacy worktree storage: `$HOME/.mozart/worktrees/`.
/// Returns `None` when `$HOME` is unresolvable. The path may not exist —
/// callers must check before acting.
pub fn legacy_worktrees_root() -> Option<PathBuf> {
    home().map(|h| h.join(".mozart").join("worktrees"))
}

/// Bundled "Get started" clone, kept inside the projects root.
pub fn get_started_dir() -> Result<PathBuf, AppError> {
    Ok(projects_root()?.join("get-started"))
}

/// Materialized end-of-turn chime, in the cache dir.
pub fn chime_path() -> Result<PathBuf, AppError> {
    Ok(cache_dir()?.join("chime.wav"))
}

/// Editable global user settings file.
pub fn global_settings_path() -> Result<PathBuf, AppError> {
    Ok(config_dir()?.join("settings.json"))
}
