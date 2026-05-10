# Plan: Step 1.6 — `branch_name.rs` + `git_query.rs` + `worktree.rs` + `workspace_service.rs`

**Spec source:** `docs/specs/plan-v0.0.1-2.md` §6 Step 1.6 (lines 283–328); D18 lock at line 154; `RepoIssue` enum at line 301.
**Author:** /plan
**Date:** 2026-05-10
**Confidence:** 8/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/src/lib.rs:1-7` declares `pub mod claude_cli; pub mod db; pub mod error; pub mod sandbox;`. **No `branch_name`, `git_query`, `worktree`, or `workspace_service` modules exist** (greenfield).
- `apps/desktop/src-tauri/src/error.rs:11-28` defines `AppError { Db | Io | NotFound | Validation | AgentSpawn }`. The trailing comment at `:27` reserves `GitCmd` for **Step 1.6** — this plan adds it.
- `apps/desktop/src-tauri/src/sandbox/mod.rs:42-73` already provides `pub(crate) fn canonical_worktrees_root() -> Result<PathBuf, AppError>` (D18 root resolution honoring `MOZART_WORKTREES_ROOT`) and `pub(super) async fn run_git(cwd, args) -> Result<String, AppError>`. The `run_git` helper is *the* git-invocation surface for Step 1.5 — this plan reuses it (visibility bump from `pub(super)` to `pub(crate)`) and adds a sibling `run_git_capture` for cases that need typed access to non-zero exits without auto-erroring.
- `apps/desktop/src-tauri/src/sandbox/mod.rs:91-95` exposes `pub(crate) fn test_env_gate() -> &'static Mutex<()>` (D1.5-L). This plan's tests reuse the same gate.
- `apps/desktop/src-tauri/src/spikes/spike_a_worktree.rs:21-74` is the proof-of-concept for `git worktree add -b <new_branch> <path> <base_branch>` — flag order locked.
- `apps/desktop/src-tauri/src/db/workspaces.rs:8-15` exposes `pub fn create(conn, ws) -> Result<(), AppError>`; `:54-63` `update_status`; `:65-74` `update_branch_name`; `:76-…` `set_deletion_intent`. `apps/desktop/src-tauri/src/db/tasks.rs:8-13` `create`; `apps/desktop/src-tauri/src/db/threads.rs:8-13` `create`. All consumed by the S1.6.4 orchestrator.
- `apps/desktop/src-tauri/src/db/models.rs:30-40` defines `Workspace { workspace_id, task_id, worktree_path, branch_name, base_branch, status, created_at, deletion_intent }`. Allowed status strings per the comment.
- `apps/desktop/src-tauri/src/db/mod.rs:83-90` provides `pub fn new_id() -> String` (UUID v4) and `pub fn now_ms() -> i64`. Used by the orchestrator.
- `apps/desktop/src-tauri/Cargo.toml:24-45` — no `tracing`, no `slug`/`heck` crate. **No new deps in this plan.** Slugification is a 30-line pure-ASCII pass; logging uses `log::warn!` (already present in `claude_cli/runner.rs:201`).
- `grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"` is at **0** hits — Naming Lock holds. This plan's vocabulary respects the Lock (no `worktree`/`branch_name`/`base_branch` in any user-facing string).

## 2. Intent — what we're delivering

After Step 1.6 closes, the desktop backend can:
1. Generate canonical branch names — `agent/wip-{short_id}` initial; `agent/{slug}` task-based with `git check-ref-format` validation and fallback.
2. Validate that a user-selected directory is a usable git repo (typed `RepoIssue` rejection: `NestedRepo | DetachedHead | NotARepo | LfsRequired | UnsupportedSubmodules`) and enumerate its branches.
3. Create / remove / orphan-clean worktrees under the canonical root `~/.mozart/worktrees/{workspace_id}/` (D18).
4. Atomically orchestrate "user clicks New Workspace": validate repo → insert Task + Workspace + Thread → create worktree → flip status to `ready`. Mid-step failures roll back.

None of these are exposed as Tauri commands yet — Step 1.7 owns IPC. The new `RepoIssue` enum carries `serde::Serialize + specta::Type` so Step 1.7 can reuse it without a wrapper.

## 3. Non-goals

- **No Tauri command registration.** Step 1.7 owns `#[tauri::command]` + `#[specta::specta]`.
- **No setup-hook wiring of `cleanup_orphans`.** Step 1.6 provides the function; Step 1.7 (or a follow-up M1.7 atom) calls it from `lib.rs::run()`. Reason: `lib.rs` is *not* in any S1.6 atom's allowed_files beyond the `pub mod` declarations.
- **No Windows-specific test coverage.** Tests gate on `git_available()` + `eprintln!` skip (matches Step 1.5 convention; overrides spec line 314's `#[ignore]` recommendation — see D1.6-J).
- **No new crate dependency.** Slugification is hand-rolled in `branch_name.rs`. `tracing` is *not* added — spec line 295 says `tracing::warn!`; we use `log::warn!` to match the rest of the crate.
- **No deep nested-repo scan.** Detection is depth-1 only (D1.6-G).
- **No DB-row-without-disk reconciliation.** `cleanup_orphans` cleans disk-without-DB only (D1.6-F).
- **No auto-detection of default base branch.** Caller passes `base_branch` explicitly. Auto-detect (`main` vs `master`) is Step 1.7+ when Tauri commands need a sensible default.
- **No retries or timeouts on git commands.** Failures surface as `AppError::GitCmd` (subprocess) or `AppError::Validation` (path-shape).
- **No slugified branch at workspace-creation time.** v0.0.1 always assigns `agent/wip-{short_id}`. The `make_task_branch` rename is a post-Step-1.7 atom (Q-A).

## 4. Architecture decisions locked in this plan

- **D1.6-A (slug rules).** `make_task_branch(title, short_id)`:
  1. Lowercase the title.
  2. Replace any char outside `[a-z0-9]` with `-`.
  3. Collapse runs of `-` to a single `-`.
  4. Trim leading/trailing `-`.
  5. Truncate to 40 chars; trim trailing `-` again post-truncation.
  6. If the result is empty → fall back to `make_initial_branch(short_id)`.
  7. Final candidate: `format!("agent/{slug}")`.
  8. Pass through `git check-ref-format refs/heads/<candidate>`; non-zero exit → `log::warn!` + fall back to `make_initial_branch(short_id)`.
- **D1.6-B (`check-ref-format` form).** Use `git check-ref-format refs/heads/<candidate>` (full-ref form), **not** `--branch <candidate>`. The `--branch` form expands `@{-N}` syntax and is documented for *interpretation*, not pure validation. Full-ref form is the syntactic-only validator we want.
- **D1.6-C (`RepoIssue` typing).** `pub enum RepoIssue { NestedRepo, DetachedHead, NotARepo, LfsRequired, UnsupportedSubmodules }` derives `Debug, Clone, Serialize, specta::Type` (no Deserialize, no PartialEq for v0.0.1). Lives in `git_query.rs`. `validate_repo(path) -> Result<(), RepoIssue>` — `Ok(())` = usable, `Err(issue)` = typed rejection. Serde tag is `#[serde(tag = "kind", rename_all = "snake_case")]` for IPC-friendly wire shape (Step 1.7).
- **D1.6-D (run_git visibility bump + `run_git_capture`).** `sandbox::run_git` becomes `pub(crate) async fn` (was `pub(super)`). Add `pub(crate) async fn run_git_capture(cwd, args) -> Result<std::process::Output, AppError>` that returns the raw `Output` and only errors on spawn/wait failure (`AppError::Io`). `validate_repo` consumes `run_git_capture` to introspect non-zero exits without auto-mapping to `GitCmd`. Existing `run_git` keeps simple semantics; its non-zero-exit error variant changes from `Validation` to `GitCmd` (D1.6-E). **Rationale for not extracting to `crate::git_util`:** Two helpers + one canonical-root function is small enough that a separate module is premature; if a fourth helper appears, extract then.
- **D1.6-E (`AppError::GitCmd` lands now).** New variant: `#[error("git command failed: {0}")] GitCmd(String)`. The reservation comment at `error.rs:27` is removed. **All sandbox + git_query + worktree non-zero-exit subprocess errors map to `GitCmd`**, replacing the `Validation` mapping in `sandbox::run_git`. Spawn/wait failure stays `Io` (existing). Path-shape failures (D1.5-A canonical-root rejection, `base_branch` empty, etc.) stay `Validation`. **Why now:** Step 1.5's plan §3 deferred this variant to Step 1.6 explicitly because Step 1.6 is the first place where typed git-error categories matter. Sandbox tests update from asserting `AppError::Validation` (on git non-zero) to `AppError::GitCmd`; sandbox path-validation tests stay on `Validation` (still correct).
- **D1.6-F (`cleanup_orphans` direction).** Removes on-disk dirs under `canonical_worktrees_root()` whose name is **not** in `workspaces.list_all()`. Direction: disk-without-DB only. DB-row-without-disk reconciliation is out of scope for v0.0.1 (Step 1.8+ may surface a status flag in the UI). Removes via `std::fs::remove_dir_all` (no `git worktree remove` since we don't have the source repo path here; orphan dirs are git-orphan too — the source repo's next `git worktree list` will auto-prune via git's own gc). Returns `usize` count of dirs removed.
- **D1.6-G (nested-repo scan depth).** Depth-1 scan: list immediate children of repo_path; if ANY is a directory containing a `.git` (file or dir), return `Err(NestedRepo)`. Recursive scan is rejected: too slow on large repos, and deeper nested repos are rare in practice for v0.0.1.
- **D1.6-H (`worktree::create` signature).** `pub async fn create(repo_path: &Path, base_branch: &str, workspace_id: &str) -> Result<WorktreeHandle, AppError>`. The `short_id` is derived inside as `&workspace_id[..8.min(workspace_id.len())]`. The worktree path is `canonical_worktrees_root()?.join(workspace_id)`. The branch name is always `make_initial_branch(short_id)` for v0.0.1 (Q-A).
- **D1.6-I (`worktree::remove` signature).** `pub async fn remove(repo_path: &Path, workspace_id: &str) -> Result<(), AppError>`. Tries `git worktree remove --force <path>` from `current_dir(repo_path)`; if that errors (e.g. "not a working tree"), proceeds to `std::fs::remove_dir_all(path)`. **Succeeds if the dir no longer exists at the end**, regardless of how it got there.
- **D1.6-J (test gating).** Tests use `git_available()` + `eprintln!` skip — **NOT** `#[ignore]`. Overrides spec line 314's `#[ignore]` recommendation. Justification matches plan-1.5 D1.5-J: CI has git, dev has git, `#[ignore]` silently excludes from default test runs and erodes the gate. Borrow `crate::sandbox::git_available()` (already `#[cfg(test)] pub(crate)`).
- **D1.6-K (env-gate reuse).** Tests touching `MOZART_WORKTREES_ROOT` acquire `crate::sandbox::test_env_gate().lock()`. Single shared gate across the crate.
- **D1.6-L (orchestrator rollback policy).** `create_workspace` rollback ladder:
  1. `validate_repo` fails → return `AppError::Validation` (formatted from `RepoIssue`); no DB writes.
  2. `tasks::create` fails → propagate; no Workspace inserted yet.
  3. `workspaces::create` fails → propagate; orphan Task row stays (acceptable — harmless, user retries).
  4. `worktree::create` fails → `workspaces::set_deletion_intent(true)`, propagate. Do NOT delete the Workspace row — keeping it lets the user see the failure in the UI later.
  5. `db::workspaces::update_branch_name` / `update_worktree_path` fails → `worktree::remove`, set `deletion_intent=1`, propagate.
  6. `threads::create` fails → `worktree::remove`, set `deletion_intent=1`, propagate.
  7. `workspaces::update_status("ready")` fails → same as step 6.
  Final success → return `Workspace` row with `status="ready"`.
- **D1.6-M (`RepoIssue` → `AppError` mapping).** Orchestrator maps `Err(issue)` to `AppError::Validation(format!("repo not usable: {issue:?}"))`. Typed enum stays available for Step 1.7 IPC; v0.0.1 surfaces as a string error to the runner.

## 5. Files

### To create
- `apps/desktop/src-tauri/src/branch_name.rs` — `make_initial_branch`, `make_task_branch`, private `slugify`.
- `apps/desktop/src-tauri/src/git_query.rs` — `RepoIssue` enum, `validate_repo`, `list_branches`, `check_git_available`.
- `apps/desktop/src-tauri/src/worktree.rs` — `WorktreeHandle`, `create`, `remove`, `cleanup_orphans`.
- `apps/desktop/src-tauri/src/workspace_service.rs` — `create_workspace` orchestrator (S1.6.4).

### To modify
- `apps/desktop/src-tauri/src/lib.rs` — add `pub mod branch_name;`, `pub mod git_query;`, `pub mod worktree;`, `pub mod workspace_service;` (4 lines).
- `apps/desktop/src-tauri/src/error.rs` — add `GitCmd(String)` variant; remove the trailing reservation comment at `:27`.
- `apps/desktop/src-tauri/src/sandbox/mod.rs` — bump `run_git` to `pub(crate)`; add `pub(crate) async fn run_git_capture`; change `run_git` non-zero-exit mapping from `Validation` to `GitCmd`.
- `apps/desktop/src-tauri/src/sandbox/checkpoint.rs` — update test asserting `Validation` on git-non-zero to assert `GitCmd`.
- `apps/desktop/src-tauri/src/sandbox/diff.rs` — same test update for the "non-existent base sha" case.
- `apps/desktop/src-tauri/src/sandbox/reset.rs` — same test update for the "non-existent sha rejection" case; the path-validation test stays on `Validation`.
- `apps/desktop/src-tauri/src/db/workspaces.rs` — add `pub fn update_worktree_path(conn, workspace_id, path) -> Result<(), AppError>` (modeled on `update_branch_name`).

### Reference (read-only — model the new code on these)
- `apps/desktop/src-tauri/src/spikes/spike_a_worktree.rs:21-74` — `git worktree add` flag order, repo init pattern.
- `apps/desktop/src-tauri/src/sandbox/checkpoint.rs:18-35` — `run_git` consumer pattern.
- `apps/desktop/src-tauri/src/db/workspaces.rs::tests` — in-memory DB test fixture pattern for S1.6.4.

## 6. Pseudocode (per non-trivial unit)

### `branch_name.rs`

```rust
use crate::sandbox::run_git;
use std::path::Path;

pub fn make_initial_branch(short_id: &str) -> String {
    format!("agent/wip-{short_id}")
}

pub async fn make_task_branch(title: &str, short_id: &str) -> String {
    let slug = slugify(title);
    if slug.is_empty() { return make_initial_branch(short_id); }
    let candidate = format!("agent/{slug}");
    let cwd = std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());
    match run_git(&cwd, &["check-ref-format", &format!("refs/heads/{candidate}")]).await {
        Ok(_) => candidate,
        Err(_) => {
            log::warn!("branch_name: '{candidate}' rejected by git check-ref-format; falling back to wip");
            make_initial_branch(short_id)
        }
    }
}

fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = false;
    for c in title.chars() {
        let lc = c.to_ascii_lowercase();
        if lc.is_ascii_alphanumeric() {
            out.push(lc);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') { out.pop(); }
    if out.len() > 40 {
        out.truncate(40);
        while out.ends_with('-') { out.pop(); }
    }
    out
}
```

### `git_query.rs`

```rust
use std::path::Path;
use serde::Serialize;
use crate::error::AppError;
use crate::sandbox::{run_git, run_git_capture};

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RepoIssue {
    NestedRepo,
    DetachedHead,
    NotARepo,
    LfsRequired,
    UnsupportedSubmodules,
}

pub fn check_git_available() -> bool {
    std::process::Command::new("git").arg("--version").output()
        .map(|o| o.status.success()).unwrap_or(false)
}

pub async fn validate_repo(path: &Path) -> Result<(), RepoIssue> {
    // 1. NotARepo
    let head_dir = run_git_capture(path, &["rev-parse", "--git-dir"]).await
        .map_err(|_| RepoIssue::NotARepo)?;
    if !head_dir.status.success() { return Err(RepoIssue::NotARepo); }

    // 2. NestedRepo (depth-1)
    if let Ok(read) = std::fs::read_dir(path) {
        for entry in read.flatten() {
            if entry.file_name() == ".git" { continue; }
            let p = entry.path();
            if p.is_dir() && p.join(".git").exists() {
                return Err(RepoIssue::NestedRepo);
            }
        }
    }

    // 3. UnsupportedSubmodules
    let gm = path.join(".gitmodules");
    if let Ok(meta) = std::fs::metadata(&gm) {
        if meta.is_file() && meta.len() > 0 {
            return Err(RepoIssue::UnsupportedSubmodules);
        }
    }

    // 4. DetachedHead
    let head = run_git_capture(path, &["symbolic-ref", "--quiet", "HEAD"]).await
        .map_err(|_| RepoIssue::NotARepo)?;
    if !head.status.success() { return Err(RepoIssue::DetachedHead); }

    // 5. LfsRequired (best-effort)
    if check_lfs_available() {
        if let Ok(out) = run_git_capture(path, &["lfs", "ls-files"]).await {
            if out.status.success() && !out.stdout.is_empty() {
                return Err(RepoIssue::LfsRequired);
            }
        }
    }
    Ok(())
}

fn check_lfs_available() -> bool {
    std::process::Command::new("git").args(["lfs", "--version"]).output()
        .map(|o| o.status.success()).unwrap_or(false)
}

pub async fn list_branches(path: &Path) -> Result<Vec<String>, AppError> {
    let out = run_git(path, &["for-each-ref", "--format=%(refname:short)", "refs/heads/"]).await?;
    Ok(out.lines().map(|s| s.to_string()).collect())
}
```

### `worktree.rs`

```rust
use std::path::{Path, PathBuf};
use crate::branch_name::make_initial_branch;
use crate::db::DbState;
use crate::error::AppError;
use crate::sandbox::{canonical_worktrees_root, run_git};

#[derive(Debug, Clone)]
pub struct WorktreeHandle {
    pub workspace_id: String,
    pub worktree_path: PathBuf,
    pub branch_name: String,
}

pub async fn create(repo_path: &Path, base_branch: &str, workspace_id: &str)
    -> Result<WorktreeHandle, AppError>
{
    if base_branch.is_empty() {
        return Err(AppError::Validation("base_branch is empty".into()));
    }
    let short = &workspace_id[..8.min(workspace_id.len())];
    let branch = make_initial_branch(short);
    let path = canonical_worktrees_root()?.join(workspace_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("mkdir worktrees root: {e}")))?;
    }
    let path_str = path.to_string_lossy().into_owned();
    run_git(repo_path, &["worktree", "add", "-b", &branch, &path_str, base_branch]).await?;
    Ok(WorktreeHandle {
        workspace_id: workspace_id.into(),
        worktree_path: path,
        branch_name: branch,
    })
}

pub async fn remove(repo_path: &Path, workspace_id: &str) -> Result<(), AppError> {
    let path = canonical_worktrees_root()?.join(workspace_id);
    let path_str = path.to_string_lossy().into_owned();
    let _ = run_git(repo_path, &["worktree", "remove", "--force", &path_str]).await;
    if path.exists() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| AppError::Io(format!("rm -rf {}: {e}", path.display())))?;
    }
    Ok(())
}

pub async fn cleanup_orphans(db: &DbState) -> Result<usize, AppError> {
    let root = canonical_worktrees_root()?;
    let known: std::collections::HashSet<String> = {
        let conn = db.lock();
        crate::db::workspaces::list_all(&conn)?
            .into_iter().map(|w| w.workspace_id).collect()
    };
    let mut removed = 0usize;
    if let Ok(read) = std::fs::read_dir(&root) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if known.contains(&name) { continue; }
            if entry.path().is_dir()
                && std::fs::remove_dir_all(entry.path()).is_ok()
            { removed += 1; }
        }
    }
    Ok(removed)
}
```

### `workspace_service.rs` (S1.6.4)

```rust
use std::path::Path;
use crate::db::models::{Task, Thread, Workspace};
use crate::db::{new_id, now_ms, tasks, threads, workspaces, DbState};
use crate::error::AppError;
use crate::git_query::validate_repo;
use crate::worktree;

pub async fn create_workspace(
    db: &DbState,
    repo_id: &str,
    repo_path: &Path,
    base_branch: &str,
    task_text: &str,
) -> Result<Workspace, AppError> {
    validate_repo(repo_path).await
        .map_err(|issue| AppError::Validation(format!("repo not usable: {issue:?}")))?;

    let task_id = new_id();
    let workspace_id = new_id();
    // Title = first line of task_text, capped at 80 chars. The full task_text
    // is preserved separately on the Task row so the body survives this trim.
    let title = task_text.lines().next().unwrap_or("untitled").chars().take(80).collect::<String>();
    let now = now_ms();

    let task = Task {
        task_id: task_id.clone(), repo_id: repo_id.into(),
        title, task_text: task_text.into(),
        status: "active".into(), created_at: now,
    };
    { let conn = db.lock(); tasks::create(&conn, &task)?; }

    let mut ws = Workspace {
        workspace_id: workspace_id.clone(), task_id: task_id.clone(),
        worktree_path: String::new(), branch_name: String::new(),
        base_branch: base_branch.into(), status: "initializing".into(),
        created_at: now, deletion_intent: 0,
    };
    { let conn = db.lock(); workspaces::create(&conn, &ws)?; }

    let handle = match worktree::create(repo_path, base_branch, &workspace_id).await {
        Ok(h) => h,
        Err(e) => {
            let conn = db.lock();
            let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
            return Err(e);
        }
    };
    ws.worktree_path = handle.worktree_path.to_string_lossy().into_owned();
    ws.branch_name = handle.branch_name.clone();

    if let Err(e) = (|| -> Result<(), AppError> {
        let conn = db.lock();
        workspaces::update_branch_name(&conn, &workspace_id, &ws.branch_name)?;
        workspaces::update_worktree_path(&conn, &workspace_id, &ws.worktree_path)?;
        Ok(())
    })() {
        let _ = worktree::remove(repo_path, &workspace_id).await;
        let conn = db.lock();
        let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
        return Err(e);
    }

    let thread = Thread { thread_id: new_id(), workspace_id: workspace_id.clone(), created_at: now };
    if let Err(e) = ({ let conn = db.lock(); threads::create(&conn, &thread) }) {
        let _ = worktree::remove(repo_path, &workspace_id).await;
        let conn = db.lock();
        let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
        return Err(e);
    }

    {
        let conn = db.lock();
        if let Err(e) = workspaces::update_status(&conn, &workspace_id, "ready") {
            drop(conn);
            let _ = worktree::remove(repo_path, &workspace_id).await;
            let conn = db.lock();
            let _ = workspaces::set_deletion_intent(&conn, &workspace_id, true);
            return Err(e);
        }
    }
    ws.status = "ready".into();
    Ok(ws)
}
```

### `error.rs` — addition

```rust
#[error("git command failed: {0}")]
GitCmd(String),
```

(Remove the trailing reservation comment at `:27`.)

### `sandbox/mod.rs` — visibility + new helper

```rust
pub(crate) async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, AppError> {
    let out = run_git_capture(cwd, args).await?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!("git {args:?} failed: {err}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

pub(crate) async fn run_git_capture(cwd: &Path, args: &[&str])
    -> Result<std::process::Output, AppError>
{
    Command::new("git").args(args).current_dir(cwd).output().await
        .map_err(|e| AppError::Io(format!("git {args:?}: {e}")))
}
```

## 7. Error handling strategy

- **`git` spawn / wait failure** → `AppError::Io(format!("git <args>: {e}"))`. Existing convention.
- **`git` non-zero exit (via `run_git`)** → `AppError::GitCmd(format!("git <args> failed: <stderr>"))`. **New behavior** in this plan; existing sandbox tests update.
- **Path-shape rejections** (`base_branch` empty, canonical-root resolution failure, Step 1.5's path-canonicalize gate) → `AppError::Validation`.
- **`RepoIssue`** → `Result<(), RepoIssue>`. Orchestrator maps to `AppError::Validation` (D1.6-M).
- **`update_*` UPDATE returns 0 rows** → `AppError::NotFound`.
- **`worktree::remove` partial failure** → `git worktree remove` errors are *swallowed* (logged via `let _ = …`); the second-step `std::fs::remove_dir_all` is the source of truth.
- **`cleanup_orphans` per-dir failure** → swallowed; counted only if the `remove_dir_all` returned `Ok`.
- **Orchestrator partial failure** → rollback ladder per D1.6-L.

## 8. Task list (will be atomized into `TASKS.md`)

1. **S1.6.1 — `error.rs::GitCmd` + `sandbox` visibility bump + sandbox-test updates** (lands first because S1.6.2 / S1.6.3 / S1.6.4 all consume `sandbox::run_git` and the new `GitCmd` variant).
   - allowed: `apps/desktop/src-tauri/src/error.rs`, `apps/desktop/src-tauri/src/sandbox/mod.rs`, `apps/desktop/src-tauri/src/sandbox/checkpoint.rs`, `apps/desktop/src-tauri/src/sandbox/diff.rs`, `apps/desktop/src-tauri/src/sandbox/reset.rs`.
   - acceptance:
     - `AppError::GitCmd(String)` added; reservation comment removed.
     - `sandbox::run_git` is `pub(crate)` and maps non-zero exits to `GitCmd`.
     - `sandbox::run_git_capture` added (`pub(crate) async fn`).
     - 3 existing sandbox tests updated (assertion variant changed; substring matchers unchanged).
   - tests: `cargo test --tests sandbox` green; clippy clean.
2. **S1.6.2 — `branch_name.rs`** (depends: S1.6.1).
   - allowed: `apps/desktop/src-tauri/src/branch_name.rs` (new), `apps/desktop/src-tauri/src/lib.rs` (add `pub mod branch_name;`).
   - tests (≥6 in `branch_name.rs #[cfg(test)] mod tests`):
     - **happy slug** — `make_task_branch("Add OAuth login", "abcd1234").await` → `"agent/add-oauth-login"`.
     - **all-special-char title** — `make_task_branch("!!! @@@ ###", "abcd1234").await` → `"agent/wip-abcd1234"`.
     - **200-char title (truncated)** — slug part is exactly 40 `a`s.
     - **non-ASCII title** — `make_task_branch("Café noir", "abcd1234").await` → `"agent/caf-noir"` (the `é` becomes `-`, then collapsed/trimmed; the `noir` survives).
     - **leading-hyphen edge** — `make_task_branch("---hello", "abcd1234").await` → `"agent/hello"`.
     - **`git check-ref-format` reject** — pure `slugify` unit test fed an injected pre-computed candidate via a `#[cfg(test)] pub(crate) async fn validate_branch_via_git(name: &str) -> bool` test seam that wraps `run_git(check-ref-format)`; assert it returns `false` for a value like `"agent/.invalid"` (which our slugifier will never produce, but git rejects).
   - integration tests gate on `crate::sandbox::git_available()` — `eprintln!` skip when missing.
3. **S1.6.3 — `git_query.rs` (`RepoIssue`, `validate_repo`, `list_branches`, `check_git_available`)** (depends: S1.6.1).
   - allowed: `apps/desktop/src-tauri/src/git_query.rs` (new), `apps/desktop/src-tauri/src/lib.rs` (add `pub mod git_query;`).
   - tests (≥6):
     - **happy-path repo** — tempdir-repo with one commit → `validate_repo` returns `Ok(())`.
     - **nested-repo refuse** — repo with a subdir that is itself a repo → `Err(NestedRepo)`.
     - **detached-HEAD refuse** — `git checkout --detach HEAD` → `Err(DetachedHead)`.
     - **missing `.git` refuse** — empty tempdir → `Err(NotARepo)`.
     - **`.gitmodules` present refuse** — non-empty file → `Err(UnsupportedSubmodules)`.
     - **`list_branches` happy** — repo with two branches → `Vec` containing both.
     - **`check_git_available` true** — assert `true` on hosts with git on PATH (skip-or-run via the standard pattern).
   - all integration tests use the `git_available()` skip pattern.
4. **S1.6.4 — `worktree.rs` (`create` / `remove` / `cleanup_orphans` + `WorktreeHandle`)** (depends: S1.6.2 for `make_initial_branch`, S1.6.1 for `run_git`/`canonical_worktrees_root`).
   - allowed: `apps/desktop/src-tauri/src/worktree.rs` (new), `apps/desktop/src-tauri/src/lib.rs` (add `pub mod worktree;`).
   - tests (≥6):
     - **`create` happy path** — tempdir repo + `MOZART_WORKTREES_ROOT` → assert returned `WorktreeHandle.worktree_path` exists; `.git` inside is a *file* (gitfile pointer); `branch_name == "agent/wip-<8-char-prefix>"`.
     - **`create` empty base_branch** — `Err(AppError::Validation(_))`.
     - **`create` invalid base_branch** — `Err(AppError::GitCmd(_))` with stderr substring (lowercased) containing `"invalid reference"` OR `"not a valid"` OR `"unknown revision"` OR `"bad object"`.
     - **`remove` happy path** — create then remove; assert dir gone.
     - **`remove` idempotent** — second call also `Ok(())`.
     - **`cleanup_orphans` removes disk-without-DB** — manually `mkdir <root>/orphan-id`; in-memory DB has zero workspace rows; `cleanup_orphans(&db)` returns `1` and the dir is gone.
     - **`cleanup_orphans` preserves known dirs** — `mkdir <root>/keep-id`; seed Repo + Task FK parents (per the fixture pattern at `db/workspaces.rs::tests:106-112`), then insert workspace row with `workspace_id = "keep-id"`; assert `cleanup_orphans` returns `0` and dir still exists.
   - All env mutations acquire `crate::sandbox::test_env_gate().lock()`.
5. **S1.6.5 — `workspace_service::create_workspace` + `db/workspaces::update_worktree_path`** (depends: S1.6.3, S1.6.4, S1.3.\*).
   - allowed:
     - `apps/desktop/src-tauri/src/workspace_service.rs` (new).
     - `apps/desktop/src-tauri/src/db/workspaces.rs` — add `update_worktree_path`.
     - `apps/desktop/src-tauri/src/lib.rs` (add `pub mod workspace_service;`).
   - tests (≥3 in `workspace_service.rs` + 2 in `db/workspaces.rs`):
     - **happy path** — in-memory DB + tempdir-repo + `MOZART_WORKTREES_ROOT` → `Workspace.status == "ready"`, `branch_name == "agent/wip-<short>"`, `worktree_path` non-empty; thread row exists.
     - **validation refuse** — pass a non-repo `repo_path`; assert `Err(AppError::Validation(_))`; assert no DB rows inserted.
     - **mid-step rollback** — pass non-existent base_branch; assert `worktree::create` fails AND the workspace row exists with `deletion_intent=1`; AND no thread row exists.
     - **`update_worktree_path` round-trip** — set then `get` → matches.
     - **`update_worktree_path` missing row** — `Err(AppError::NotFound)`.
6. **S1.6.6 — Step 1.6 final gate** (depends: S1.6.1–S1.6.5).
   - acceptance: `cargo test --tests` green (pre-existing 70 tests + ~20 new across atoms 1–5); `cargo clippy --all-targets -- -D warnings` clean; `pnpm nx run-many -t typecheck` clean; no out-of-scope file touched; Naming Lock 0 hits; Step-1.6-specific assertions present.

## 9. Validation gate

```sh
# Rust core
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && LC_ALL=C cargo test --tests
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings

# Typecheck
pnpm nx run-many -t typecheck

# Naming Lock
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts" 2>/dev/null

# Step-1.6 assertions
grep -n "GitCmd" apps/desktop/src-tauri/src/error.rs
grep -n "agent/wip-" apps/desktop/src-tauri/src/branch_name.rs
grep -n "pub enum RepoIssue" apps/desktop/src-tauri/src/git_query.rs
grep -n '"worktree", "add"' apps/desktop/src-tauri/src/worktree.rs
grep -n "pub async fn create_workspace" apps/desktop/src-tauri/src/workspace_service.rs
grep -n "pub fn update_worktree_path" apps/desktop/src-tauri/src/db/workspaces.rs

# tracing must NOT be introduced
! grep -rn "tracing::" apps/desktop/src-tauri/src/branch_name.rs \
                       apps/desktop/src-tauri/src/git_query.rs \
                       apps/desktop/src-tauri/src/worktree.rs \
                       apps/desktop/src-tauri/src/workspace_service.rs
```

`git_available()`-gated tests execute on any host with `git` on PATH; they self-skip with `eprintln!` otherwise.

## 10. Rollback

- Each new file (`branch_name.rs`, `git_query.rs`, `worktree.rs`, `workspace_service.rs`) is a fresh module — `rm` reverts cleanly.
- The `error.rs::GitCmd` addition is a single variant; reverting requires also reverting the sandbox-test updates in S1.6.1. `git revert <S1.6.1 commit>` does both atomically.
- The `sandbox::run_git` visibility bump is a one-token edit (`pub(super)` → `pub(crate)`). Reverting strands `worktree.rs` and `git_query.rs` callers (compile error) — but those modules go away in the same revert.
- The `db/workspaces::update_worktree_path` addition is purely additive; revert is trivial.
- `lib.rs` gains four `pub mod` lines — trivially reversible.
- No schema migration; no generated bindings (Step 1.7 owns specta).

## 11. Open questions

(none — see "Resolved during /plan" below for the four judgment calls.)

### Resolved during /plan

**Q-A. Does `create_workspace` use `make_task_branch` (slugified) or `make_initial_branch` (wip)?**
Resolved: **initial** (`agent/wip-{short_id}`). Spec line 79 names "the `agent/wip-{shortid}` initial branch placeholder and the slug+`git check-ref-format` rename pattern" — implying a *later* rename, not slugification at creation. Renaming a worktree branch later requires `git branch -m` + worktree config update; that's a future atom (post Step 1.7 IPC). Trade-off: branches look generic in v0.0.1. PLAN-v0.0.1.md L487-498 doesn't surface the branch in any user-facing string, so the cost is zero in the UI.

**Q-B. Is `tracing` added now or later?**
Resolved: **never** (in v0.0.1). The crate uses `log::*` consistently. Spec line 295's `tracing::warn!` is a wording artifact. Adding `tracing` is a 100+ KB dep and a logging-architecture decision; out of scope for Step 1.6.

**Q-C. Should `cleanup_orphans` reconcile DB-without-disk too?**
Resolved: **no** (D1.6-F). v0.0.1 surfaces "workspace exists in DB but worktree dir missing" via the future Step 1.8 UI status flag. Disk-without-DB (orphan dirs from crashed runs) is the actual risk; that's what `cleanup_orphans` covers.

**Q-D. Does the nested-repo scan recurse?**
Resolved: **no** (D1.6-G). Depth-1 immediate-children scan only. Recursive scan would dominate validation time on monorepos with thousands of subdirs. Depth-1 catches the most common case (user selected a parent dir of multiple repos).

## 12. Confidence

**8/10** — Spec-pinned acceptance criteria leave little room for interpretation; the locked decisions D1.6-A through D1.6-M close the obvious judgment calls. The orchestrator (S1.6.5) is the highest-risk atom because:
- It coordinates four DB tables + a subprocess + a typed error mapping.
- The rollback ladder (D1.6-L) is seven-deep; an off-by-one error would leak orphan worktrees.
- Adding `update_worktree_path` to `db/workspaces.rs` cross-cuts S1.3 deliverables; a reviewer could push for splitting S1.6.5 into 5a (CRUD) and 5b (orchestrator), which the implementer is free to do.

Confidence drops below 9 only because:
1. Slug behavior under non-ASCII (D1.6-A step 2) is opinionated — `é` → `-` (replaced) rather than `e` (transliterated). Reviewer may push for `unidecode`-style transliteration; v0.0.1 ships ASCII-only.
2. The `git check-ref-format` test (S1.6.2's 6th case) requires either a slugifier-bypass test seam or finding an input that survives slugification but git rejects. Plan picks the test seam (`#[cfg(test)] pub(crate) async fn validate_branch_via_git`).
3. `RepoIssue::LfsRequired` requires `git lfs` on PATH; on a host without LFS, an LFS-using repo passes validation. Acceptable best-effort per spec line 302.
