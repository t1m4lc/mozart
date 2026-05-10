# Plan: Step 1.5 — `sandbox` (git_checkpoint / capture_diff / discard_changes_to)

**Spec source:** `docs/specs/plan-v0.0.1-2.md` §6 Step 1.5 (lines 249–281); D18 lock at line 154; reach-back contract from `tmp/done-plans/04-step-1-4-claude-cli.md` §11 Q-A.
**Author:** /plan
**Date:** 2026-05-10
**Confidence:** 9/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/src/lib.rs:1-3` declares `pub mod claude_cli; pub mod db; pub mod error;` — **no `sandbox` module exists yet** (greenfield for this step).
- `apps/desktop/src-tauri/src/error.rs:11-27` defines `AppError { Db | Io | NotFound | Validation | AgentSpawn }`. The trailing comment at `:27` reserves `GitCmd` for Step 1.6 — **Step 1.5 does NOT add a new variant**; git failures map to `AppError::Validation` for path-shape rejections and `AppError::Io` (via existing `From<std::io::Error>`) for spawn-or-wait failures, with the stderr text passed through as the message.
- `apps/desktop/src-tauri/src/db/agent_runs.rs:20-27` exposes `update_status(conn, run_id, status)` — model for the new `update_checkpoint_sha`. `agent_runs.checkpoint_sha` is `Option<String>` per `apps/desktop/src-tauri/src/db/models.rs:60`.
- `apps/desktop/src-tauri/src/db/workspace_changes.rs:7-19` exposes `insert(conn, &WorkspaceChange) -> Result<i64, AppError>` — used by the post-exit reach-back in S1.5.4.
- `apps/desktop/src-tauri/src/db/models.rs` defines `WorkspaceChange { change_id, workspace_id, run_id: Option<String>, diff_text, files_added, files_modified, files_deleted, captured_at }` — matches `migrations/001_init.sql`.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs:138-156` — **the reach-back surface**. `spawn_run` takes `&Workspace` (carrying `worktree_path`) + `&AgentRun` + `Channel<StreamEvent>` + `&DbState`. Pre-spawn checkpoint goes after line `:144` (`resolve_claude_bin()`); post-exit `capture_diff` + `workspace_changes::insert` go inside the supervisor task at `:351-360` (right after `mark_ended`).
- `apps/desktop/src-tauri/src/spikes/spike_a_worktree.rs:7-17` — pattern for the `git_available()` skip used by the new tests; `git init --initial-branch=main` + `git config user.email/user.name` + `git commit --allow-empty -m init` is the working test setup.
- `apps/desktop/src-tauri/Cargo.toml:24-45` — `tokio` already has `process+rt-multi-thread+macros+io-util`; `tempfile` + `anyhow` are already in `dev-dependencies`. **No `Cargo.toml` edits.**
- No `dirs` / `home` / `directories` crate is in scope. Canonical worktrees root resolution must use `std::env::var("HOME")` (Unix) and `std::env::var("USERPROFILE")` (Windows), with a `MOZART_WORKTREES_ROOT` test-override env var matching the existing `MOZART_CLAUDE_BIN` pattern in `claude_cli/runner.rs:102-104`.
- The Naming Lock greps in the prior gate (`grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"`) must remain at zero hits outside `docs/competitors/`.

## 2. Intent — what we're delivering

After Step 1.5 closes, the desktop backend can (a) capture a pre-run `git` checkpoint sha against a workspace's `worktree_path`, (b) compute a `DiffSummary` (unified text + per-category file counts) between any base sha and `HEAD`, and (c) safely roll back a worktree to a recorded sha, refusing any path that does not live under the canonical `~/.mozart/worktrees/` root (D18 enforcement). The `claude_cli::runner::spawn_run` function gains the two reach-back call-sites that the Step 1.4 plan deferred: it captures a checkpoint sha pre-spawn (writing it onto `agent_runs.checkpoint_sha` via a new `update_checkpoint_sha` CRUD), and on successful exit captures a diff and inserts a `workspace_changes` row. None of these functions are exposed as Tauri commands yet — Step 1.7 owns that.

## 3. Non-goals

- **No new `AppError` variant.** `GitCmd` belongs to Step 1.6 (commented reservation in `error.rs:27`). Step 1.5 routes git failures through `AppError::Io` (spawn/wait) and `AppError::Validation` (path-shape, non-zero exit with stderr).
- **No Tauri command registration.** Step 1.7 owns the `#[tauri::command]` + `#[specta::specta]` exposure. The three sandbox functions and the `update_checkpoint_sha` CRUD are Rust-internal in v0.0.1.
- **No Windows-specific test coverage.** `discard_changes_to`'s path-validation tests use `MOZART_WORKTREES_ROOT` to point at a tempdir (cross-platform). The `HOME`/`USERPROFILE` resolution is exercised only via the override path in tests; the production resolution branch is exercised by manual smoke at the end of Lane A (after Step 1.9).
- **No real-`git`-required CI gating decision.** Tests that need a `git` binary call a local `git_available()` helper and `eprintln!` + early-return when it is missing (mirrors `spikes/spike_a_worktree.rs:22`). `cargo test` reports them as passing-by-skip; CI is expected to have `git` installed and so they will execute.
- **No retries or timeouts on git commands.** Calls are short-lived; failures surface as `AppError::Io`/`Validation`. Step 1.6 may revisit if `git worktree add` proves flaky.
- **No `tracing` dependency.** Use `log::warn!` consistent with `claude_cli/runner.rs`.
- **No async-runtime requirement leaked through the public API.** All three sandbox functions are `pub async fn` (so the runner can await them inline without `spawn_blocking`), but their bodies use `tokio::process::Command` directly — no extra deps.
- **No backfill of `agent_runs.checkpoint_sha` for runs created before this step.** v0.0.1 has no users; Q-A confirms forward-only.
- **No `DiffSummary` rename detection or `--find-renames` tuning.** v0.0.1 ships the default `git diff --numstat` semantics. Default behavior (`diff.renames=true` since git 2.9) emits a single `<a>\t<d>\tname{old => new}` row per detected rename — counted as `files_modified` per D1.5-F. If a user has set `git config --global diff.renames false`, renames degrade to two rows (`files_added += 1` + `files_deleted += 1`); acceptable for v0.0.1.

## 4. Architecture decisions locked in this plan

- **D1.5-A (path validation gate).** `discard_changes_to` accepts a path only if `path.canonicalize()?.starts_with(canonical_worktrees_root()?)`. Rejection → `AppError::Validation("path is not under canonical worktrees root: …")`. Symlink escape is blocked by `canonicalize`. **Why:** D18 demands defense-in-depth so a misbehaving caller can never `git reset --hard` outside the sandbox — this is the single load-bearing safety check in Step 1.5.
- **D1.5-B (canonical root resolution).** Helper `fn canonical_worktrees_root() -> Result<PathBuf, AppError>` lives in `sandbox/mod.rs`. Order of resolution: `MOZART_WORKTREES_ROOT` (test override, fully overrides) → `$HOME/.mozart/worktrees` (Unix) → `$USERPROFILE\.mozart\worktrees` (Windows) → `AppError::Validation`. The override mirrors `MOZART_CLAUDE_BIN` (`claude_cli/runner.rs:102-104`).
- **D1.5-C (sync-vs-async).** All three sandbox functions are `pub async fn`. They use `tokio::process::Command` (already in `Cargo.toml`). The runner reach-back calls them with `.await` from inside the existing async surface; no `spawn_blocking`.
- **D1.5-D (`DiffSummary` location).** `pub struct DiffSummary { diff_text, files_added, files_modified, files_deleted }` lives in `sandbox/diff.rs`, re-exported from `sandbox/mod.rs`. **No `serde`/`specta` derives** in v0.0.1 — Step 1.7 wraps it for IPC if needed; today no command consumes it.
- **D1.5-E (`update_checkpoint_sha` CRUD shape).** New function in `db/agent_runs.rs`: `pub fn update_checkpoint_sha(conn: &Connection, run_id: &str, sha: &str) -> Result<(), AppError>`. Matches the `update_status` pattern (`agent_runs.rs:20-27`); returns `AppError::NotFound` if no row updates. **Not** `Option<&str>` — checkpoint is always set when the function is called.
- **D1.5-F (numstat parser).** `git diff <base> HEAD --numstat` output is `<added>\t<deleted>\t<path>` per file. Renames render as `<added>\t<deleted>\t{old => new}`. `files_added` = lines where `<deleted> == 0` AND `<added> > 0`; `files_deleted` = lines where `<added> == 0` AND `<deleted> > 0`; `files_modified` = lines where both `> 0`. Binary files (`-\t-\tpath`) count as `files_modified`. Pure-rename rows (`0\t0\tpath`) count as `files_modified`. **Why:** spec §6.5.2 line 269 names the four counts but does not define their decision rule — locking it here so the implementer doesn't re-derive.
- **D1.5-G (empty-diff returns zeros, no error).** Per spec line 271. `git diff` exits 0 with empty stdout when the working tree matches the base sha; the parser must accept zero lines and return `DiffSummary { diff_text: "", files_added: 0, files_modified: 0, files_deleted: 0 }`.
- **D1.5-H (checkpoint message + identity).** `git_checkpoint` runs `git add -A` then `git commit --allow-empty --no-gpg-sign -m "checkpoint before run"` then `git rev-parse HEAD`. The `--no-gpg-sign` is essential: gpg failures must not block the run. **No** `git config user.email/name` — that is the caller's repo's responsibility; if the user's environment is missing identity, `git commit` fails with stderr captured into `AppError::Validation`. **Forward-pointer for Step 1.6:** `worktree::create` should ensure the new worktree inherits identity from the parent repo (or `git -c user.name=… -c user.email=…` is layered in at the worktree-creation step) so the checkpoint succeeds on a clean machine.
- **D1.5-I (reach-back error policy).** In the runner, a `git_checkpoint` failure pre-spawn aborts `spawn_run` with the original `AppError`. A `capture_diff` failure post-exit is logged via `log::warn!` and silently dropped — the run already succeeded, the changes feed is best-effort persistence, and the supervisor must not panic. A `workspace_changes::insert` failure follows the same `log::warn!`-and-continue policy as the existing `agent_events::insert` calls in `runner.rs:198, :248`.
- **D1.5-J (test gating).** Tests requiring a real `git` binary use a local `git_available()` helper (modeled on `spikes/spike_a_worktree.rs:11-17`). Skip with `eprintln!` early-return when `git` is missing — DO NOT mark `#[ignore]`. Justification: CI has git; local dev does too; `#[ignore]` would silently exclude these from the validation gate. Tests that assert on git-stderr substrings set `LC_ALL=C` for the spawned `git` process so the assertion survives non-English locales.
- **D1.5-K (single git-invocation helper).** The three sandbox files share one `pub(super) async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, AppError>` in `sandbox/mod.rs`. `checkpoint.rs`, `diff.rs`, and `reset.rs` call into it instead of duplicating the spawn-and-stderr-mapping body. Single source of truth for git-error mapping; matches the project's "no second way to do something" guidance.
- **D1.5-L (env-var gate for tests).** `MOZART_WORKTREES_ROOT` is a process-global env var, just like `MOZART_CLAUDE_BIN` / `MOZART_MOCK_FIXTURE` in `claude_cli/runner.rs`. To prevent races between the sandbox tests (S1.5.3) and the runner integration tests (S1.5.4) when both run via `cargo test`, S1.5.1 places the shared gate in `sandbox/mod.rs` as `#[cfg(test)] pub(crate) fn test_env_gate() -> &'static std::sync::Mutex<()>` (single `OnceLock` static). S1.5.3 calls it before any `MOZART_WORKTREES_ROOT` mutation; S1.5.4 retires the local `env_gate()` in `claude_cli/runner.rs:437-440` and replaces every call site with `crate::sandbox::test_env_gate()`. One process-wide gate covers all three env vars.

## 5. Files

### To create
- `apps/desktop/src-tauri/src/sandbox/mod.rs` — module root; declares `pub mod checkpoint; pub mod diff; pub mod reset;` and re-exports `git_checkpoint`, `capture_diff`, `discard_changes_to`, `DiffSummary`. Hosts: (a) `pub(crate) fn canonical_worktrees_root() -> Result<PathBuf, AppError>`; (b) `pub(super) async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, AppError>` — the single git-invocation helper (D1.5-K) that maps spawn errors to `Io` and non-zero exits to `Validation` with stderr passthrough; (c) `#[cfg(test)] pub(crate) fn git_available() -> bool` skip helper; (d) `#[cfg(test)] pub(crate) fn test_env_gate() -> &'static std::sync::Mutex<()>` shared across sandbox + runner tests (D1.5-L).
- `apps/desktop/src-tauri/src/sandbox/checkpoint.rs` — `pub async fn git_checkpoint(workspace_path: &Path) -> Result<String, AppError>`. Calls into `super::run_git`.
- `apps/desktop/src-tauri/src/sandbox/diff.rs` — `pub struct DiffSummary { … }` + `pub async fn capture_diff(workspace_path: &Path, base_sha: &str) -> Result<DiffSummary, AppError>` (calls `super::run_git`) + a private pure `parse_numstat(stdout: &str) -> (i64, i64, i64)` helper unit-tested without git.
- `apps/desktop/src-tauri/src/sandbox/reset.rs` — `pub async fn discard_changes_to(workspace_path: &Path, sha: &str) -> Result<(), AppError>`. Calls `super::run_git` for the `git reset --hard` invocation.

### To modify
- `apps/desktop/src-tauri/src/lib.rs` — add `pub mod sandbox;` (single line, between `pub mod error;` and the `#[cfg(test)] mod spikes;`).
- `apps/desktop/src-tauri/src/db/agent_runs.rs` — add `pub fn update_checkpoint_sha(conn, run_id, sha) -> Result<(), AppError>` (sibling of `update_status`); add a unit test. **No other changes** to that file.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs` — two surgical edits:
  1. After `:144` (`let bin = resolve_claude_bin();`) and before `:147` (`let mut cmd = Command::new(&bin);`): call `sandbox::git_checkpoint(Path::new(&workspace.worktree_path)).await?`, then call `agent_runs::update_checkpoint_sha(&db.lock(), &run.run_id, &sha)?` (drop the lock immediately). On error, propagate the `AppError` — `spawn_run` returns `Err`. The captured sha is also stored into a local `let checkpoint_sha = sha;` so the supervisor task can `move`-capture it for the post-exit diff.
  2. Inside the supervisor task right after the existing `mark_ended` call (around `:351-360`): if and only if `status_str == "done"`, call `sandbox::capture_diff(Path::new(&workspace_path_for_supervisor), &checkpoint_sha).await` (where `workspace_path_for_supervisor` is a `String` cloned before the supervisor `tokio::spawn`), build a `WorkspaceChange { workspace_id, run_id, diff_text, files_added, files_modified, files_deleted, captured_at: now_ms() }`, and call `workspace_changes::insert`. On any error in this block, `log::warn!` and continue (D1.5-I). The `workspace_id` is captured from `&workspace.workspace_id` before the supervisor spawns.

### Reference (read-only — model the new code on these)
- `apps/desktop/src-tauri/src/spikes/spike_a_worktree.rs:7-78` — `git_available()` pattern, repo-init test fixture, `git config` identity setup.
- `apps/desktop/src-tauri/src/claude_cli/install.rs` — the `tokio::process::Command + timeout + capture stdout` shape used by the three sandbox functions.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs:102-104` — `MOZART_*`-style env override pattern reused for `MOZART_WORKTREES_ROOT`.
- `apps/desktop/src-tauri/src/db/agent_runs.rs:20-27` — `update_status` is the shape for `update_checkpoint_sha`.
- `apps/desktop/src-tauri/src/db/workspace_changes.rs:7-19` — `insert` call shape for the supervisor reach-back.

## 6. Pseudocode (per non-trivial unit)

### `sandbox/mod.rs`

```rust
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub mod checkpoint;
pub mod diff;
pub mod reset;

pub use checkpoint::git_checkpoint;
pub use diff::{capture_diff, DiffSummary};
pub use reset::discard_changes_to;

use crate::error::AppError;

pub(crate) fn canonical_worktrees_root() -> Result<PathBuf, AppError> {
    if let Some(o) = std::env::var_os("MOZART_WORKTREES_ROOT") {
        return Ok(PathBuf::from(o));
    }
    #[cfg(unix)]
    let home = std::env::var_os("HOME");
    #[cfg(windows)]
    let home = std::env::var_os("USERPROFILE");
    home.map(|h| PathBuf::from(h).join(".mozart").join("worktrees"))
        .ok_or_else(|| AppError::Validation("home dir not resolvable".into()))
}

/// Single source of truth for git invocation + error mapping (D1.5-K).
/// Spawn / wait failure → Io. Non-zero exit → Validation with stderr.
pub(super) async fn run_git(cwd: &Path, args: &[&str]) -> Result<String, AppError> {
    let out = Command::new("git").args(args).current_dir(cwd).output().await
        .map_err(|e| AppError::Io(format!("git {args:?}: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::Validation(format!("git {args:?} failed: {err}")));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
pub(crate) fn git_available() -> bool {
    std::process::Command::new("git").arg("--version").output()
        .map(|o| o.status.success()).unwrap_or(false)
}

#[cfg(test)]
pub(crate) fn test_env_gate() -> &'static std::sync::Mutex<()> {
    use std::sync::OnceLock;
    static GATE: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    GATE.get_or_init(|| std::sync::Mutex::new(()))
}
```

### `sandbox/checkpoint.rs`

```rust
use std::path::Path;
use crate::error::AppError;
use super::run_git;

pub async fn git_checkpoint(workspace_path: &Path) -> Result<String, AppError> {
    run_git(workspace_path, &["add", "-A"]).await?;
    run_git(workspace_path, &["commit", "--allow-empty", "--no-gpg-sign", "-m", "checkpoint before run"]).await?;
    let out = run_git(workspace_path, &["rev-parse", "HEAD"]).await?;
    Ok(out.trim().to_string())
}
```

### `sandbox/diff.rs`

```rust
use std::path::Path;
use tokio::process::Command;
use crate::error::AppError;

pub struct DiffSummary {
    pub diff_text: String,
    pub files_added: i64,
    pub files_modified: i64,
    pub files_deleted: i64,
}

pub async fn capture_diff(workspace_path: &Path, base_sha: &str) -> Result<DiffSummary, AppError> {
    use super::run_git;
    let numstat = run_git(workspace_path, &["diff", base_sha, "HEAD", "--numstat"]).await?;
    let unified = run_git(workspace_path, &["diff", base_sha, "HEAD"]).await?;
    let (a, m, d) = parse_numstat(&numstat);
    Ok(DiffSummary { diff_text: unified, files_added: a, files_modified: m, files_deleted: d })
}

fn parse_numstat(stdout: &str) -> (i64, i64, i64) {
    let (mut added, mut modified, mut deleted) = (0i64, 0i64, 0i64);
    for line in stdout.lines() {
        // Format: <added>\t<deleted>\t<path>. Binary: -\t-\t<path>.
        let mut parts = line.splitn(3, '\t');
        let a = parts.next().unwrap_or("");
        let d = parts.next().unwrap_or("");
        if parts.next().is_none() { continue; }                    // malformed → skip
        if a == "-" && d == "-" { modified += 1; continue; }       // binary
        let av: i64 = a.parse().unwrap_or(0);
        let dv: i64 = d.parse().unwrap_or(0);
        match (av, dv) {
            (0, 0) => modified += 1,                                // pure rename
            (_, 0) => added += 1,
            (0, _) => deleted += 1,
            (_, _) => modified += 1,
        }
    }
    (added, modified, deleted)
}

// (no local helper — uses super::run_git per D1.5-K)
```

### `sandbox/reset.rs`

```rust
use std::path::Path;
use crate::error::AppError;
use super::{canonical_worktrees_root, run_git};

pub async fn discard_changes_to(workspace_path: &Path, sha: &str) -> Result<(), AppError> {
    let canon = workspace_path.canonicalize()
        .map_err(|e| AppError::Validation(format!("canonicalize {}: {e}", workspace_path.display())))?;
    let root = canonical_worktrees_root()?.canonicalize()
        .map_err(|e| AppError::Validation(format!("canonicalize root: {e}")))?;
    if !canon.starts_with(&root) {
        return Err(AppError::Validation(format!(
            "path is not under canonical worktrees root: {}", canon.display()
        )));
    }
    run_git(&canon, &["reset", "--hard", sha]).await.map(|_| ())
}
```

### `db/agent_runs.rs` — addition

```rust
pub fn update_checkpoint_sha(conn: &Connection, run_id: &str, sha: &str) -> Result<(), AppError> {
    let n = conn.execute(
        "UPDATE agent_runs SET checkpoint_sha = ?1 WHERE run_id = ?2",
        params![sha, run_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("agent_run id={run_id}")));
    }
    Ok(())
}
```

### `claude_cli/runner.rs` — reach-back sketch

```rust
// pre-spawn (around current line :145)
let workspace_path = workspace.worktree_path.clone();
let workspace_id   = workspace.workspace_id.clone();
let checkpoint_sha = crate::sandbox::git_checkpoint(std::path::Path::new(&workspace_path)).await?;
{
    let conn = db.lock();
    crate::db::agent_runs::update_checkpoint_sha(&conn, &run.run_id, &checkpoint_sha)?;
}

// inside supervisor, AFTER mark_ended, AFTER the status_str match:
if status_str == "done" {
    match crate::sandbox::capture_diff(std::path::Path::new(&workspace_path), &checkpoint_sha).await {
        Ok(summary) => {
            let change = crate::db::models::WorkspaceChange {
                change_id: 0,
                workspace_id: workspace_id.clone(),
                run_id: Some(run_id.clone()),
                diff_text: summary.diff_text,
                files_added: summary.files_added,
                files_modified: summary.files_modified,
                files_deleted: summary.files_deleted,
                captured_at: now_ms(),
            };
            let conn = match db_arc.lock() {
                Ok(c) => c,
                Err(_) => { log::warn!("workspace_changes insert: db mutex poisoned"); return; }
            };
            if let Err(e) = crate::db::workspace_changes::insert(&conn, &change) {
                log::warn!("workspace_changes::insert failed: {e}");
            }
        }
        Err(e) => log::warn!("capture_diff failed: {e}"),
    }
}
```

## 7. Error handling strategy

- **`git` spawn / wait failure** → `AppError::Io(String)` (existing `From<std::io::Error>` is not used here because `Command::output().await` returns `io::Error` only on spawn-or-pipe failure — wrap manually with `format!("git …: {e}")` so the message identifies the call site).
- **`git` non-zero exit** → `AppError::Validation` carrying `"git <args> failed: <stderr>"`. Stays in `Validation` (not a new `GitCmd`) per §3.
- **Path canonicalize failure** → `AppError::Validation` (file does not exist, permission denied, etc.) — surfaced for both `workspace_path` and the canonical root in `discard_changes_to`.
- **Path not under canonical root** → `AppError::Validation("path is not under canonical worktrees root: …")` (D1.5-A).
- **`update_checkpoint_sha` UPDATE returns 0 rows** → `AppError::NotFound` (matches `update_status` shape in `agent_runs.rs:23-26`).
- **Reach-back failures inside the runner supervisor** → `log::warn!` and continue (D1.5-I). The pre-spawn `git_checkpoint` failure aborts the entire `spawn_run` with `AppError`.
- **`workspace_changes::insert` failure inside supervisor** → `log::warn!` and continue (mirrors the existing `agent_events::insert` policy at `runner.rs:198`).
- **Empty diff** → returned as `DiffSummary { diff_text: "", files_added: 0, files_modified: 0, files_deleted: 0 }`, never an error (D1.5-G).

## 8. Task list (will be atomized into `TASKS.md`)

1. **S1.5.1 — `sandbox::git_checkpoint`** (parallelizable with S1.5.2 and S1.5.3).
   - allowed: `apps/desktop/src-tauri/src/sandbox/mod.rs`, `apps/desktop/src-tauri/src/sandbox/checkpoint.rs`, `apps/desktop/src-tauri/src/lib.rs` (add `pub mod sandbox;`).
   - tests (≥3, all under `#[cfg(test)] mod tests` in `checkpoint.rs`):
     - **happy path** — `git_available()` skip-or-run; in a `tempfile::tempdir` `git init --initial-branch=main`-ed repo with identity configured + initial commit, write a file, call `git_checkpoint`; assert returned sha is 40 hex chars; assert `HEAD` resolves to it.
     - **idempotent re-run** — call `git_checkpoint` twice on a clean tree; second call must succeed (exercises `--allow-empty`); both shas exist in `git log`.
     - **propagates stderr on failure** — call against a non-repo dir; assert `Err(AppError::Validation(msg))` where `msg.contains("not a git repository")` (case-insensitive substring; the exact `git` message varies by version, so use `.to_lowercase()`).
2. **S1.5.2 — `sandbox::capture_diff`** + `DiffSummary` (parallelizable with S1.5.1 and S1.5.3).
   - allowed: `apps/desktop/src-tauri/src/sandbox/diff.rs`. Re-export added in S1.5.1's `sandbox/mod.rs` after both atoms land — until then, the implementer of S1.5.2 also amends `sandbox/mod.rs` to add `pub mod diff;` (this is the one cross-atom file edit; coordination is via the dependency on S1.5.1 landing first).
   - tests (≥5):
     - **`parse_numstat` unit (no git)** — feed canned strings: `""` → `(0,0,0)`; `"3\t0\tfoo\n"` → `(1,0,0)`; `"0\t5\tbar\n"` → `(0,0,1)`; `"4\t2\tbaz\n"` → `(0,1,0)`; `"-\t-\timg.png\n"` → `(0,1,0)`; `"0\t0\t{old => new}\n"` → `(0,1,0)`; mixed multi-line.
     - **happy path** — fixture repo with one added, one modified, one deleted file between two commits; assert `files_added=1, files_modified=1, files_deleted=1`; assert `diff_text` non-empty and contains `"diff --git"`.
     - **empty diff** — same sha for base + HEAD; assert all four fields are zero/empty (D1.5-G).
     - **non-existent base sha** — call with random hex; assert `Err(AppError::Validation(_))` with stderr substring (lowercased `"unknown revision"` or `"bad revision"`).
   - `git_available()` skip applies to the three integration tests; the `parse_numstat` test is pure.
3. **S1.5.3 — `sandbox::discard_changes_to`** + `canonical_worktrees_root` helper (parallelizable with S1.5.1 and S1.5.2; needs S1.5.1 only to merge first because both edit `sandbox/mod.rs`).
   - allowed: `apps/desktop/src-tauri/src/sandbox/reset.rs`. Same coordination caveat as S1.5.2 for `sandbox/mod.rs` (adds `pub mod reset;` and the `canonical_worktrees_root` helper).
   - tests (≥5):
     - **`canonical_worktrees_root` honors `MOZART_WORKTREES_ROOT`** — set the env, assert the returned path equals the override.
     - **path-not-under-root rejection** — set `MOZART_WORKTREES_ROOT` to a tempdir; call `discard_changes_to` with a path under `/tmp` (canonicalized but outside the override); assert `Err(AppError::Validation(msg))` where `msg.contains("not under canonical worktrees root")`.
     - **happy round-trip** — under `MOZART_WORKTREES_ROOT`, build a fixture repo: initial commit (sha A) + a second commit that adds a file (sha B); call `discard_changes_to(repo, A)`; assert the added file no longer exists and `git rev-parse HEAD == A`.
     - **non-existent sha rejection** — same fixture; pass random hex; assert `Err(AppError::Validation(_))` with stderr substring.
     - **symlink escape blocked** — under `MOZART_WORKTREES_ROOT`, create a symlink that points outside the root; call against the symlink path; assert `Err(AppError::Validation(msg))` where `msg.contains("not under canonical worktrees root")` (the `canonicalize` resolves the symlink, then `starts_with` rejects). `#[cfg(unix)]`-gated.
   - All env mutations acquire `crate::sandbox::test_env_gate().lock()` (defined in S1.5.1 per D1.5-L) — this is the single shared gate used by sandbox tests AND the runner integration tests in S1.5.4.
4. **S1.5.4 — runner reach-back + `update_checkpoint_sha` CRUD** (depends: S1.5.1, S1.5.2; **cross-cuts** S1.4 work — this is the deferred Q-A item from `tmp/done-plans/04-step-1-4-claude-cli.md` §11).
   - allowed: `apps/desktop/src-tauri/src/db/agent_runs.rs`, `apps/desktop/src-tauri/src/claude_cli/runner.rs`.
   - tests (≥3 — extend `runner.rs` existing test module; same `env_gate` pattern):
     - **CRUD round-trip (pure DB unit, in `agent_runs.rs`)** — seed a thread + run; call `update_checkpoint_sha(conn, run_id, "deadbeef…")`; assert `get(conn, run_id).checkpoint_sha == Some("deadbeef…")`. Plus a missing-row test asserting `AppError::NotFound`.
     - **integration: happy path writes both `checkpoint_sha` AND a `workspace_changes` row** — extend `integration_happy_path` (or add a sibling test): set `MOZART_WORKTREES_ROOT` to a tempdir + initialize the workspace's `worktree_path` as a real git repo inside that root with one commit; run the existing happy fixture; assert `agent_runs.checkpoint_sha` is `Some(_)`, AND assert exactly one `workspace_changes` row exists for the run with `files_added/modified/deleted` summing to ≥0 (the mock fixture doesn't actually edit files, so an empty diff is the expected outcome).
     - **integration: non-zero exit does NOT write `workspace_changes`** — extend `integration_non_zero_exit_with_stderr`: under the same git-init-ed worktree setup, assert `agent_runs.checkpoint_sha` is `Some(_)` (pre-spawn checkpoint always runs) AND `workspace_changes` for this run is empty (post-exit diff guarded by `status_str == "done"`).
   - **Cross-cutting**: the existing `runner.rs` integration tests (`integration_happy_path`, `integration_tool_use_falls_back_to_cli_output`, `integration_cancel_mid_stream`, `integration_non_zero_exit_with_stderr`) currently use `env!("CARGO_MANIFEST_DIR")` as `worktree_path` — which IS already a git repo (the repo we're working in). After this atom, those tests will pass through the new `git_checkpoint` call too. The atom must either (a) update those tests to point `worktree_path` at a fresh tempdir-repo so they don't dirty the working repo's `git status` mid-test, OR (b) accept that the existing tests now create real checkpoint commits in the repo. Decision: **(a)** — update the four existing tests' `seed()` helper to create a tempdir-repo and set `worktree_path` to it. This is the only change to the four already-passing tests.
5. **S1.5.5 — Step 1.5 final gate** (depends: S1.5.1, S1.5.2, S1.5.3, S1.5.4).
   - acceptance: `cargo test --tests` green (existing tests + the new ~16 sandbox tests + the runner extensions); `cargo clippy --all-targets -- -D warnings` clean; no files touched outside `apps/desktop/src-tauri/src/sandbox/**`, `lib.rs`, `db/agent_runs.rs`, `claude_cli/runner.rs`; Naming Lock greps remain at zero hits.

## 9. Validation gate

```sh
# Rust core
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && cargo test --tests
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings

# Typecheck still intact
pnpm nx run-many -t typecheck

# Naming Lock — must be 0 hits outside docs/competitors/
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts" 2>/dev/null

# Step-1.5-specific: assert the canonical-root assertion is present
grep -n "not under canonical worktrees root" apps/desktop/src-tauri/src/sandbox/reset.rs

# Step-1.5-specific: assert the runner reach-back call-sites are present
grep -n "sandbox::git_checkpoint" apps/desktop/src-tauri/src/claude_cli/runner.rs
grep -n "sandbox::capture_diff"   apps/desktop/src-tauri/src/claude_cli/runner.rs
grep -n "workspace_changes::insert" apps/desktop/src-tauri/src/claude_cli/runner.rs
grep -n "update_checkpoint_sha"   apps/desktop/src-tauri/src/claude_cli/runner.rs

# Step-1.5-specific: assert the locked checkpoint message
grep -n "checkpoint before run"   apps/desktop/src-tauri/src/sandbox/checkpoint.rs

# Step-1.5-specific: forbid `--no-verify` and any skip-hooks short-circuit on the checkpoint commit
! grep -rn "no-verify" apps/desktop/src-tauri/src/sandbox/
```

The `git_available()`-gated tests will execute on any host with `git` on PATH (CI + dev); they self-skip with `eprintln!` otherwise. They are NOT `#[ignore]`-marked.

## 10. Rollback

- `sandbox/**` is a fresh subtree — `rm -rf apps/desktop/src-tauri/src/sandbox/` reverts S1.5.1–S1.5.3 cleanly.
- The `update_checkpoint_sha` addition to `db/agent_runs.rs` is purely additive; no callers outside the Step 1.5 reach-back. Reverting the function is safe.
- The runner reach-back is two contiguous edits in `claude_cli/runner.rs` — `git revert` of the S1.5.4 commit restores the pre-Step-1.5 runner exactly.
- No schema migration; no generated bindings (Step 1.7 owns specta export).
- The `lib.rs` change is one line (`pub mod sandbox;`) — trivially reversible.
- The four pre-existing `runner.rs` integration tests are modified in S1.5.4 to use a tempdir-repo. Reverting that change restores the `env!("CARGO_MANIFEST_DIR")` path; the tests will continue passing because the working repo is itself a valid git repo.

## 11. Open questions

(none — see "Resolved during /plan" below for the two judgment calls.)

### Resolved during /plan

**Q-A. Should the runner reach-back ship in Step 1.5 (per `tmp/done-plans/04-step-1-4-claude-cli.md` §11) or be deferred to Step 1.7?**
Resolved: ship in Step 1.5 as **S1.5.4**. The done-plan for Step 1.4 §11 explicitly committed to the reach-back living "in Step 1.5 atoms" — deferring further would leave `agent_runs.checkpoint_sha` permanently null in v0.0.1 and silently drop the changes feed. S1.5.4 is the single atom that touches `claude_cli/runner.rs`; it is gated on S1.5.1 + S1.5.2 only, so atoms 1–3 stay parallelizable.

**Q-B. Does Step 1.5 introduce `AppError::GitCmd` now, or wait for Step 1.6?**
Resolved: **wait** (D1.5 rationale, §3). The comment at `error.rs:27` reserves `GitCmd` for Step 1.6 specifically because Step 1.6 is the first place where typed git-error categories matter (e.g. `RepoIssue` enum mapping). Step 1.5 git failures are either path-shape (already a `Validation` concept) or transport-level (already `Io`); a new variant would be churn for one step. Trade-off: error messages are slightly less typed at the IPC boundary, but Step 1.5 has no IPC surface anyway (no Tauri command), so the cost is zero in v0.0.1.

## 12. Confidence

**9/10** — Reviewer pass 1 fixed the only BLOCKING bug (validation gate `grep -n` on a directory now uses `-rn`), reconciled the §3-vs-§4 numstat rename inconsistency on D1.5-F, locked test-locale stability via `LC_ALL=C`, unified git invocation via D1.5-K's shared `run_git` helper, and unified the test env-var gate via D1.5-L. The remaining judgment calls are (i) routing git failures through `Validation`/`Io` instead of a new `GitCmd` variant (Q-B, defers churn to Step 1.6) and (ii) bundling the seed-helper migration into S1.5.4 instead of splitting (chosen because the reach-back commit is the trigger that makes the old seed helper unsafe — splitting creates a window where `cargo test` is broken). Confidence below 10 only because S1.5.4 is the first atom that mutates code shipped in a prior step.
