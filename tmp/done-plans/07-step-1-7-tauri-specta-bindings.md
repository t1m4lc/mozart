# Plan: Step 1.7 — Tauri commands wiring + tauri-specta TS bindings

**Spec source:** `docs/specs/plan-v0.0.1-2.md` §6 Step 1.7 (atoms S1.7.1–S1.7.3) · `docs/PLAN-v0.0.1.md` L120-134 (command surface) · `docs/TODO.md` §3 (Step 1.7 checklist) · `.context/context.md` (Step 1.4 vocabulary lock — informs field naming)
**Author:** /plan
**Date:** 2026-05-11
**Confidence:** 9/10 (post-review pass 2)

---

## 1. Verified repo truths

Cited file:line. Each is a present-tense fact the `plan-reviewer` can grep.

### Tauri / Rust surface

- `apps/desktop/src-tauri/src/lib.rs:1-28` — current `run()` registers eight `pub mod` files + `tauri_plugin_log` in debug; **no** `.invoke_handler`, **no** `.manage(state)`, **no** specta wiring.
- `apps/desktop/src-tauri/src/main.rs:5` — entry calls `app_lib::run()`.
- `apps/desktop/src-tauri/build.rs:1-3` — three-line stub: `fn main() { tauri_build::build() }`.
- `apps/desktop/src-tauri/Cargo.toml:20-22, 33-34, 45` — `tauri-specta = "2.0.0-rc.21"` (features `derive`, `typescript`) and `specta = "2.0.0-rc.22"` are declared in **both** `[build-dependencies]` and `[dependencies]`. `specta-typescript = "0.0.9"` is in `[build-dependencies]` (line 22) and `[dev-dependencies]` (line 45) only — **NOT in `[dependencies]`**. Since the typegen call (`specta_typescript::Typescript::default()`) lives in `lib.rs run()`, this one line must be added to `[dependencies]` (the only Cargo edit this plan requires).
- `apps/desktop/src-tauri/Cargo.toml:28` — `tauri = "2.11.1"`.
- `apps/desktop/src-tauri/tauri.conf.json:7-11` — `frontendDist = "../../../dist/apps/desktop/browser"`, dev URL `http://localhost:4200`.
- `apps/desktop/src-tauri/capabilities/default.json:8-10` — only `core:default` permissions. No allow-list for individual commands (tauri-specta commands are routed via the standard `invoke_handler` so the default capability is sufficient for v0.0.1).

### Spike D — the typegen reference pattern

- `apps/desktop/src-tauri/src/spikes/spike_d_specta.rs:6-11` — author note: *"build.rs runs in a separate compilation unit and can't easily reference lib symbols. The official tauri-specta v2 pattern wires the Builder in lib.rs `run()` with `#[cfg(debug_assertions)] builder.export(...)`. Step 1.7 implements that for real production commands."*
- `apps/desktop/src-tauri/src/spikes/spike_d_specta.rs:55-63` — verified-working invocation:
  ```rust
  let builder = tauri_specta::Builder::<tauri::Wry>::new()
      .commands(tauri_specta::collect_commands![spike_d_echo])
      .typ::<SpikeResult>().typ::<SpikeError>();
  builder.export(specta_typescript::Typescript::default(), &out)?;
  ```
- `apps/desktop/src-tauri/src/spikes/spike_d_specta.rs:39-47` — verified-working command shape: `#[tauri::command] #[specta::specta] pub fn spike_d_echo(n: i32) -> Result<SpikeResult, SpikeError>`.

### Backing services (one per command)

- `apps/desktop/src-tauri/src/error.rs:9-29` — `AppError { Db, Io, NotFound, Validation, AgentSpawn, GitCmd }`, all variants `Serialize + specta::Type`, `#[serde(tag="kind", content="message")]`. **Specta-ready as-is.**
- `apps/desktop/src-tauri/src/db/mod.rs:31-39` — `pub struct DbState(pub Arc<Mutex<Connection>>)` + `.lock()`.
- `apps/desktop/src-tauri/src/db/mod.rs:43-48` — `pub fn init_db(path: &Path) -> Result<DbState, AppError>`.
- `apps/desktop/src-tauri/src/db/repos.rs:8, 16, 28` — `create(&Repo)`, `get_by_path(&str)`, `list()`. **No `get(&str)` — gap to fill.**
- `apps/desktop/src-tauri/src/db/workspaces.rs:17, 43` — `get(workspace_id) -> Workspace`, `list_all() -> Vec<Workspace>`.
- `apps/desktop/src-tauri/src/db/threads.rs:16` — `get_by_workspace(workspace_id) -> Thread`.
- `apps/desktop/src-tauri/src/db/agent_runs.rs:8, 67, 80` — `create(&AgentRun)`, `get(run_id)`, `list_by_thread(thread_id)`.
- `apps/desktop/src-tauri/src/db/workspace_changes.rs:20` — `latest_for_workspace(workspace_id) -> Result<Option<WorkspaceChange>, AppError>`.
- `apps/desktop/src-tauri/src/db/models.rs:13, 21, 31, 43, 50, 63, 72, 84, 94` — all 9 row structs (`Repo, Task, Workspace, Thread, AgentRun, AgentEvent, WorkspaceChange, OutboxEvent, ConfigEntry`) already derive `Debug, Clone, Serialize, Deserialize, specta::Type`. **Already specta-ready — no derive additions needed.**
- `apps/desktop/src-tauri/src/workspace_service.rs:34-40` — `create_workspace(db, repo_id, repo_path, base_branch, task_text) -> Workspace`. **Takes `repo_path: &Path`**, not derivable from `repo_id` alone via current `repos.rs` — the command will resolve path via a new `repos::get` helper (see §5 To modify).
- `apps/desktop/src-tauri/src/git_query.rs:30-37, 41, 69, 121` — `RepoIssue` enum (5 variants) already derives `Debug, Clone, Serialize, specta::Type` with `#[serde(tag="kind", rename_all="snake_case")]`. `check_git_available() -> bool`, `validate_repo(&Path) -> Result<(), RepoIssue>`, `list_branches(&Path) -> Result<Vec<String>, AppError>`. **`RepoIssue` is specta-ready but we still collapse it into `AppError::Validation(...)` at the command layer** (see §5/§7) so the typed surface stays minimal.
- `apps/desktop/src-tauri/src/worktree.rs:36-50, 76, 90` — `WorktreeHandle { workspace_id, worktree_path, branch_name }` (internal-only per concept lock), `create(...)`, `remove(repo_path, workspace_id)`, `cleanup_orphans(db)`. **WorktreeHandle stays out of Tauri surfaces — D17/D20.**
- `apps/desktop/src-tauri/src/sandbox/reset.rs:26` — `discard_changes_to(workspace_path: &Path, sha: &str) -> Result<(), AppError>`.
- `apps/desktop/src-tauri/src/claude_cli/mod.rs:15-26` — `StreamEvent` enum: `StreamToken | ToolCall | CliOutput | StatusUpdate | Error`, `#[serde(tag="kind", rename_all="snake_case")]`, derives `Serialize, Deserialize, specta::Type`. **Specta-ready.**
- `apps/desktop/src-tauri/src/claude_cli/install.rs:18-21, 43` — `pub enum ClaudeInstall { Installed { version: String }, Missing }`, `pub async fn check_installed() -> ClaudeInstall`. **`ClaudeInstall` lacks `specta::Type` + `Serialize` derives** — gap to fill.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs:69-100, 142-147` — `pub struct RunHandle { ... }` with `pub async fn cancel(&self) -> Result<(), AppError>`, `pub async fn await_complete(self) -> Result<(), AppError>`. `spawn_run(workspace, run, channel, db) -> Result<RunHandle, AppError>`.

### Angular surface

- `apps/desktop/src/app/app.config.ts:6-15` — `provideRouter(appRoutes, withHashLocation())` + `provideTheme()`. **No Tauri service.**
- `apps/desktop/src/app/` directory contents: `app.component.ts`, `app.config.ts`, `app.routes.ts`, `component.ts`. **No `_bindings.ts`, no `services/`.**
- `apps/desktop/src/app/app.routes.ts` exists (route shell stub).

### Repo conventions

- `.gitignore` (root) currently lists `tmp/*` (with `!tmp/ready-plans/` exception), `dist`, `node_modules`. **No entry for `_bindings.ts`** — must be added so the generated file never lands in git (per S1.7.2 acceptance).
- `apps/desktop/src-tauri/.gitignore:1-4` already ignores `/target/` and `/gen/schemas`.
- `docs/specs/plan-v0.0.1-2.md:153` — D17 + §6.5 row F0 — **public field names use canonical vocabulary only** (`workspace_id`, `task_id`, `run_id`, `change_id`, `prompt`, `status`). No `worktree_path`, `branch_name`, `agent/wip-…` in any Tauri command return shape.
- `docs/specs/plan-v0.0.1-2.md:156` — D20 — `list_runs(workspace_id)` resolves the thread internally; **threads are not a Tauri surface** in v0.0.1.

## 2. Intent — what we're delivering

After this plan ships, Mozart's Rust backend exposes a **typed, specta-generated** command + event surface to Angular. Eleven `#[tauri::command] #[specta::specta]` functions cover the v0.0.1 user journey (add a repo → create a workspace → spawn an agent run → watch streamed events → review the diff → commit/discard). A `tauri_specta::Builder` in `lib.rs run()` (a) registers the commands with `tauri::Builder::invoke_handler`, (b) mounts the typed event channel(s) on the app, and (c) under `cfg(debug_assertions)` re-exports `apps/desktop/src/app/_bindings.ts` so Angular always types against the current Rust shape.

This unblocks Step 1.8 (Angular shell UI): components can import `commands.createWorkspace(...)` etc. with full type inference.

## 3. Non-goals

- **F0 doc atom (CLAUDE.md "Product vocabulary" section).** Hard prerequisite documented in `docs/TODO.md` §2 + `docs/specs/plan-v0.0.1-2.md` §7 F0. Run F0 as its own single-commit cycle **before** `/atomize`-ing this plan. Not in scope here.
- **Telemetry `track_event` command.** Belongs to Step 2.3 (Lane C) per `docs/specs/plan-v0.0.1-2.md:387`. Will be added additively when `telemetry.rs` lands; the specta Builder will simply gain an extra `collect_commands![..., track_event]` line.
- **`start_claude_login_pty` + `detect_claude_auth` PTY/keychain flow.** Requires `keychain.rs` + PTY login plumbing that PLAN-v0.0.1.md describes but Lane A hasn't built. Deferred to v0.0.2. We surface `check_claude_install` (binary present/missing + version string) which is what the v0.0.1 onboarding actually needs.
- **Angular services.** No `*.service.ts` files. Step 1.8 writes them; this plan only generates `_bindings.ts` for them to import.
- **Tauri capabilities granularity.** v0.0.1 sticks with `core:default`. No per-command allow-list (commands routed through standard `invoke_handler` are covered).
- **Streaming-event back-pressure / dropped-channel cleanup.** v0.0.1 lets the channel buffer unboundedly; D1.4 already documented this risk. RunRegistry holds RunHandles but does not auto-evict on supervisor exit (next agent run replaces the entry; stale entries are harmless because `cancel()` on a finished handle is a no-op).
- **Schema migrations.** Zero. Step 1.3 already laid the 9 tables.
- **`workspace_changes`-driven "commit" command** (write the diff back to base). v0.0.1 says discard is implemented, commit is manual / future. The diff-viewer UI in Step 1.8 will show the diff; the commit decision is the user's outside-Mozart action in v0.0.1.

## 4. Architecture decisions locked in this plan

- **Specta typegen runs in `lib.rs run()` under `#[cfg(debug_assertions)]`**, not in `build.rs`. Rationale: `spike_d_specta.rs:6-11` confirms build.rs cannot easily reference lib-crate symbols; the tauri-specta v2 idiom is to construct the `Builder` once, call `builder.invoke_handler()` into the tauri Builder, and call `builder.export(...)` separately under debug-only cfg so release binaries never write to the source tree. `tauri-specta` stays in `[build-dependencies]` only because of feature-flag interaction; the actual export call is in lib code.
- **`apps/desktop/src/app/_bindings.ts` is gitignored.** Regenerated on every debug build of `lib.rs::run()` and also by the dedicated `bindings_export` cargo test (which constructs the same Builder via `bindings_export::build_specta_builder()`). The CI integrity check is the **`bindings_export` test passing** (asserts every command name and type appears in the generated TS) plus **`tsc --noEmit` on the Angular project** in Step 1.8+ (any consumer import that no longer matches a generated binding fails type-check). This plan only emits the `.gitignore` line, the typegen call, and the test.
- **Twelve commands** (eleven from the user-locked decision plus `archive_workspace`, added during plan review so Step 1.8's archive button has a backing command from day one — D19 archive flag is `workspaces.deletion_intent`, already CRUD-able via the existing `workspaces::set_deletion_intent`):
  ```
  list_repos                      -> Vec<Repo>
  add_repo(path)                  -> Repo
  list_branches(repo_path)        -> Vec<String>
  create_workspace(repo_id, base_branch, task_text)
                                  -> Workspace
  list_workspaces                 -> Vec<Workspace>
  archive_workspace(workspace_id) -> ()
  start_agent_run(workspace_id, prompt, on_event)
                                  -> AgentRun
  stop_agent_run(run_id)          -> ()
  list_runs(workspace_id)         -> Vec<AgentRun>
  get_workspace_diff(workspace_id)
                                  -> Option<WorkspaceChange>
  discard_workspace_changes(workspace_id)
                                  -> ()
  check_claude_install            -> ClaudeInstall
  ```
- **Tauri state**: two `Manage`-d states — `DbState` (already exists in code; this plan first instantiates it on startup) and **a new `RunRegistry`** that owns running `RunHandle`s keyed by `run_id`. `RunRegistry` is `Arc<Mutex<HashMap<String, Arc<RunHandle>>>>`; `start_agent_run` registers, `stop_agent_run` looks up + `.cancel()`s.
- **Canonical vocabulary in public shapes.** No `worktree_path`, `branch_name`, `agent/wip-…`, `checkpoint_sha` field appears in any command **argument**. They may appear in **return** structs (e.g. `Workspace.worktree_path`) because those rows are read straight from the DB; Step 1.8 components agree to never render those fields in UI strings (CLAUDE.md F0 contract enforces this at the UI layer).
- **`Channel<StreamEvent>` is the streaming surface** for `start_agent_run`. tauri-specta v2 generates the TS shape `Channel<StreamEvent>` on the client side; the existing `spawn_run` signature consumes it unchanged.
- **DbState lives at `${app_data_dir}/mozart.db`** resolved via Tauri v2 `app.path().app_data_dir()` inside `.setup`. Dev override via `MOZART_DB_PATH` env var (same pattern as `MOZART_CLAUDE_BIN` / `MOZART_WORKTREES_ROOT` used in tests).
- **No new `pub mod` in `lib.rs` besides `pub mod commands;`.** The commands module hosts every `#[tauri::command]` function. Re-exports through `pub use commands::*` happen only inside `collect_commands![...]`.
- **Specta `Type` derives added additively** on `Repo`, `Task`, `Workspace`, `Thread`, `AgentRun`, `WorkspaceChange`, `RepoIssue`, `ClaudeInstall`. No behavior change. Existing `Serialize + Deserialize` derives on the row structs cover the JSON wire shape.

## 5. Files

### To create

- `apps/desktop/src-tauri/src/commands/mod.rs` — declares 12 `#[tauri::command] #[specta::specta]` functions; re-exports their handles for `collect_commands!`.
- `apps/desktop/src-tauri/src/run_registry.rs` — `pub struct RunRegistry(Arc<Mutex<HashMap<String, Arc<RunHandle>>>>)` + `register`, `cancel` methods.
- `apps/desktop/src-tauri/src/bindings_export.rs` — `pub fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry>` — single source of the `.commands(collect_commands![...])` + `.typ::<...>()` chain. Reused by `lib.rs::run()` and the `bindings_export` integration test under `tests/`. **`pub` (not `pub(crate)`)** because integration tests link the crate as an external consumer.
- `apps/desktop/src-tauri/tests/bindings_export.rs` — integration test that calls `build_specta_builder().export(...)` to a tempdir and asserts each command name + every typed surface appears in the generated `.ts`.
- `apps/desktop/src/app/_bindings.ts` — generated by `tauri_specta::Builder::export`; **never hand-edited**.

### To modify

- `apps/desktop/src-tauri/Cargo.toml:24-40` — add one line under `[dependencies]`: `specta-typescript = "0.0.9"` (already declared in `[build-dependencies]` and `[dev-dependencies]` — runtime use of `specta_typescript::Typescript` in `lib.rs` requires the regular-deps entry).
- `apps/desktop/src-tauri/src/lib.rs` — add `pub mod commands; pub mod run_registry;`; rewrite `run()` body to: `use tauri::Manager;` → resolve db path → `db::init_db` → instantiate `RunRegistry` → build `tauri_specta::Builder` with all 12 commands + every typed surface → `#[cfg(debug_assertions)] builder.export(...)` → wire into `tauri::Builder::default().invoke_handler(builder.invoke_handler()).setup(move |app| { app.manage(db); app.manage(registry); setup_builder.mount_events(app); /* existing logger */; Ok(()) }).run(...)`.
- `apps/desktop/src-tauri/src/claude_cli/install.rs:17` — add `Serialize + specta::Type` to the existing `#[derive(Debug, Clone, PartialEq, Eq)]` on `ClaudeInstall`. Also add `#[serde(tag = "kind", rename_all = "snake_case")]` so the wire shape mirrors `StreamEvent`. (`Deserialize` not required — UI never sends `ClaudeInstall` back.)
- `apps/desktop/src-tauri/src/db/repos.rs` — add `pub fn get(conn: &Connection, repo_id: &str) -> Result<Repo, AppError>` (small CRUD gap discovered during plan — needed by `create_workspace` command to resolve `repo_id` → `repo_path`).
- `.gitignore` (root) — add a single line: `apps/desktop/src/app/_bindings.ts`.

### Reference (read-only — model the new code on these)

- `apps/desktop/src-tauri/src/spikes/spike_d_specta.rs:55-87` — verified-working `Builder::new().commands(...).typ::<...>().export(...)` invocation. Production code mirrors this exactly minus the tmpdir.
- `apps/desktop/src-tauri/src/workspace_service.rs:34-144` — orchestrator pattern (validate → insert → rollback ladder) that the `create_workspace` Tauri command **delegates to**, not duplicates.
- `apps/desktop/src-tauri/src/claude_cli/runner.rs:142-430` — `spawn_run` signature + `RunHandle` lifecycle the `start_agent_run` Tauri command consumes.
- `apps/desktop/src-tauri/src/db/mod.rs:31-48` — `DbState` shape + `init_db` pattern (already idiomatic; reused unchanged).

## 6. Pseudocode

### `apps/desktop/src-tauri/src/run_registry.rs`

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::claude_cli::RunHandle;
use crate::error::AppError;

pub struct RunRegistry(Arc<Mutex<HashMap<String, Arc<RunHandle>>>>);

impl RunRegistry {
    pub fn new() -> Self { Self(Arc::new(Mutex::new(HashMap::new()))) }

    pub fn register(&self, run_id: String, handle: Arc<RunHandle>) {
        let mut g = self.0.lock().expect("registry poisoned");
        if g.contains_key(&run_id) {
            log::debug!("RunRegistry: overwriting entry for run_id={run_id}");
        }
        g.insert(run_id, handle);
    }

    /// Cancel by run_id. Missing entry → AppError::NotFound.
    pub async fn cancel(&self, run_id: &str) -> Result<(), AppError> {
        let handle = self.0.lock().expect("registry poisoned").get(run_id).cloned();
        match handle {
            Some(h) => h.cancel().await,
            None => Err(AppError::NotFound(format!("no live run for run_id={run_id}"))),
        }
    }
}
```

> **Why `Arc<RunHandle>`:** clone-out-of-lock so we can `.await` `cancel()` without holding the Mutex across an await. `RunHandle.cancel()` already takes `&self`, so `Arc` is sufficient.

### `apps/desktop/src-tauri/src/commands/mod.rs` — one example per category (the implementer mirrors the pattern for the rest)

```rust
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};

use crate::claude_cli::{install, spawn_run, StreamEvent};
use crate::db::{
    self, agent_runs, models::*, new_id, now_ms, repos, threads,
    workspace_changes, workspaces, DbState,
};
use crate::error::AppError;
use crate::git_query;
use crate::run_registry::RunRegistry;
use crate::sandbox;
use crate::workspace_service;

#[tauri::command]
#[specta::specta]
pub async fn list_repos(db: State<'_, DbState>) -> Result<Vec<Repo>, AppError> {
    let conn = db.lock();
    repos::list(&conn)
}

#[tauri::command]
#[specta::specta]
pub async fn add_repo(db: State<'_, DbState>, path: String) -> Result<Repo, AppError> {
    let p = std::path::Path::new(&path);
    // Validate first — typed RepoIssue collapses into AppError::Validation.
    git_query::validate_repo(p).await
        .map_err(|issue| AppError::Validation(format!("repo not usable: {issue:?}")))?;
    let conn = db.lock();
    // Idempotency: if path is already registered, return the existing row.
    if let Ok(existing) = repos::get_by_path(&conn, &path) { return Ok(existing); }
    let r = Repo {
        repo_id: new_id(),
        path: path.clone(),
        display_name: p.file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone()),
        added_at: now_ms(),
    };
    repos::create(&conn, &r)?;
    Ok(r)
}

#[tauri::command]
#[specta::specta]
pub async fn list_branches(repo_path: String) -> Result<Vec<String>, AppError> {
    git_query::list_branches(std::path::Path::new(&repo_path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_workspace(
    db: State<'_, DbState>,
    repo_id: String, base_branch: String, task_text: String,
) -> Result<Workspace, AppError> {
    // Resolve repo_id -> repo_path via new repos::get helper.
    let repo_path = {
        let conn = db.lock();
        repos::get(&conn, &repo_id)?.path
    };
    // `db.inner()` derefs State<'_, DbState> to &DbState for fn calls.
    workspace_service::create_workspace(
        db.inner(), &repo_id, std::path::Path::new(&repo_path),
        &base_branch, &task_text,
    ).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_workspaces(db: State<'_, DbState>) -> Result<Vec<Workspace>, AppError> {
    let conn = db.lock();
    workspaces::list_all(&conn)
}

/// Flip `workspaces.deletion_intent` so Step 1.8's archive button has a
/// no-op-friendly persistence target. v0.0.1 archive == deletion_intent=1
/// per D19; the v0.0.2 `archived_at INTEGER` column (F1) supersedes this.
#[tauri::command]
#[specta::specta]
pub async fn archive_workspace(
    db: State<'_, DbState>, workspace_id: String,
) -> Result<(), AppError> {
    let conn = db.lock();
    workspaces::set_deletion_intent(&conn, &workspace_id, true)
}

#[tauri::command]
#[specta::specta]
pub async fn start_agent_run(
    db: State<'_, DbState>,
    registry: State<'_, RunRegistry>,
    workspace_id: String, prompt: String,
    on_event: Channel<StreamEvent>,
) -> Result<AgentRun, AppError> {
    // Lookup workspace + thread (D20: 1:1 traversal).
    let (ws, thread) = {
        let conn = db.lock();
        (workspaces::get(&conn, &workspace_id)?,
         threads::get_by_workspace(&conn, &workspace_id)?)
    };
    let run = AgentRun {
        run_id: new_id(),
        thread_id: thread.thread_id,
        prompt,
        status: "running".into(),
        started_at: now_ms(),
        ended_at: None, exit_code: None,
        error_message: None, checkpoint_sha: None,
    };
    {
        let conn = db.lock();
        agent_runs::create(&conn, &run)?;
    }
    // spawn_run wants &DbState; State<DbState> derefs via .inner().
    let handle = spawn_run(&ws, &run, on_event, db.inner()).await?;
    registry.register(run.run_id.clone(), std::sync::Arc::new(handle));
    Ok(run)
}

#[tauri::command]
#[specta::specta]
pub async fn stop_agent_run(
    registry: State<'_, RunRegistry>, run_id: String,
) -> Result<(), AppError> {
    registry.cancel(&run_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_runs(
    db: State<'_, DbState>, workspace_id: String,
) -> Result<Vec<AgentRun>, AppError> {
    let conn = db.lock();
    let thread = threads::get_by_workspace(&conn, &workspace_id)?;
    agent_runs::list_by_thread(&conn, &thread.thread_id)
}

#[tauri::command]
#[specta::specta]
pub async fn get_workspace_diff(
    db: State<'_, DbState>, workspace_id: String,
) -> Result<Option<WorkspaceChange>, AppError> {
    let conn = db.lock();
    workspace_changes::latest_for_workspace(&conn, &workspace_id)
}

/// "Undo the last agent run." Resets the worktree to the most-recent
/// `agent_runs.checkpoint_sha` for this workspace's thread. Only the
/// latest run's diff is reverted; earlier-run diffs that were never
/// committed upstream stay in the worktree. With no prior run that
/// captured a checkpoint, returns `AppError::Validation` (UI shows
/// a friendly "nothing to discard" toast). For the v0.0.1 single-decision
/// flow (one run per archive/discard cycle) this matches the user's
/// mental model.
#[tauri::command]
#[specta::specta]
pub async fn discard_workspace_changes(
    db: State<'_, DbState>, workspace_id: String,
) -> Result<(), AppError> {
    let (worktree_path, checkpoint_sha) = {
        let conn = db.lock();
        let ws = workspaces::get(&conn, &workspace_id)?;
        let thread = threads::get_by_workspace(&conn, &workspace_id)?;
        let runs = agent_runs::list_by_thread(&conn, &thread.thread_id)?;
        let sha = runs.iter().rev()
            .find_map(|r| r.checkpoint_sha.clone())
            .ok_or_else(|| AppError::Validation(
                "no checkpoint to discard to (no agent runs yet)".into()))?;
        (ws.worktree_path, sha)
    };
    sandbox::discard_changes_to(std::path::Path::new(&worktree_path), &checkpoint_sha).await
}

#[tauri::command]
#[specta::specta]
pub async fn check_claude_install() -> install::ClaudeInstall {
    install::check_installed().await
}
```

### `apps/desktop/src-tauri/src/lib.rs` — new `run()`

```rust
pub mod bindings_export;
pub mod branch_name;
pub mod claude_cli;
pub mod commands;
pub mod db;
pub mod error;
pub mod git_query;
pub mod run_registry;
pub mod sandbox;
pub mod workspace_service;
pub mod worktree;

#[cfg(test)]
mod spikes;

use std::path::PathBuf;
use tauri::Manager; // brings `app.path()` and `app.manage(...)` into scope

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Build the typed surface once; clone it for the setup-closure move.
    let specta_builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::list_repos,
            commands::add_repo,
            commands::list_branches,
            commands::create_workspace,
            commands::list_workspaces,
            commands::archive_workspace,
            commands::start_agent_run,
            commands::stop_agent_run,
            commands::list_runs,
            commands::get_workspace_diff,
            commands::discard_workspace_changes,
            commands::check_claude_install,
        ])
        .typ::<error::AppError>()
        .typ::<claude_cli::StreamEvent>()
        .typ::<claude_cli::install::ClaudeInstall>()
        .typ::<db::models::Repo>()
        .typ::<db::models::Task>()
        .typ::<db::models::Workspace>()
        .typ::<db::models::Thread>()
        .typ::<db::models::AgentRun>()
        .typ::<db::models::WorkspaceChange>();

    // Debug-only: regenerate TS bindings from the source of truth.
    #[cfg(debug_assertions)]
    specta_builder
        .export(
            specta_typescript::Typescript::default()
                .formatter(specta_typescript::formatter::prettier),
            "../src/app/_bindings.ts",
        )
        .expect("tauri-specta export failed");

    // Clone for the setup move (we still need the builder's invoke_handler
    // below). `tauri_specta::Builder` is `Clone` in v2.0.0-rc.21.
    let setup_builder = specta_builder.clone();

    tauri::Builder::default()
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            // 0. Preserve the debug-only logger gate from the pre-1.7 lib.rs
            //    (release builds stay quiet by default).
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 1. Resolve DB path: env override > app_data_dir/mozart.db
            let db_path: PathBuf = std::env::var_os("MOZART_DB_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    let dir = app.path().app_data_dir()
                        .expect("app_data_dir unresolvable");
                    std::fs::create_dir_all(&dir).ok();
                    dir.join("mozart.db")
                });
            let db_state = db::init_db(&db_path).expect("db init failed");
            app.manage(db_state);

            // 2. Run registry for live runs.
            app.manage(run_registry::RunRegistry::new());

            // 3. Wire the typed event mounting (no-op for v0.0.1 events, but
            //    forward-compatible: future emitted events register here).
            setup_builder.mount_events(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### `apps/desktop/src-tauri/src/db/repos.rs` — additive gap fill

```rust
pub fn get(conn: &Connection, repo_id: &str) -> Result<Repo, AppError> {
    conn.query_row(
        "SELECT repo_id, path, display_name, added_at FROM repos WHERE repo_id = ?1",
        [repo_id],
        |row| Ok(Repo {
            repo_id: row.get(0)?, path: row.get(1)?,
            display_name: row.get(2)?, added_at: row.get(3)?,
        }),
    ).map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows =>
            AppError::NotFound(format!("repo_id={repo_id}")),
        other => AppError::Db(other.to_string()),
    })
}
```

Test: round-trip `create` → `get` returns same row; `get` on missing id → `NotFound`.

## 7. Error handling strategy

- **Every command returns `Result<T, AppError>`.** AppError is already `serde::Serialize + specta::Type` with `#[serde(tag="kind", content="message")]`, so the TS surface is `type AppError = { kind: "Db"|"Io"|"NotFound"|"Validation"|"AgentSpawn"|"GitCmd", message: string }`.
- **`RepoIssue` does NOT cross the wire.** `add_repo` collapses `Err(RepoIssue::*)` into `AppError::Validation(format!("repo not usable: {issue:?}"))` — matching the existing pattern in `workspace_service::create_workspace`. Angular shows the message via toast; no structured discriminant for v0.0.1.
- **`stop_agent_run` on an unknown run_id** returns `AppError::NotFound`. UI can ignore (idempotent stop). Re-stopping a finished run = `NotFound` too (entry never inserted or stale-not-cleaned — still acceptable).
- **`discard_workspace_changes` with no prior run** → `AppError::Validation("no checkpoint to discard to (no agent runs yet)")`. UI surfaces verbatim.
- **DB mutex poisoning** uses `expect("db mutex poisoned")` per the existing pattern in `db/mod.rs:38`. A poisoned mutex is an unrecoverable bug; surface fast.
- **Channel emit failures** (UI dropped) are silently ignored inside `spawn_run` — they're not a command-level concern; events keep persisting to `agent_events`.
- **Specta export failure** uses `.expect(...)` — debug-only path; a panic at dev start is the right failure mode (visible immediately).
- **DB init failure** uses `.expect(...)` — startup-time failure is unrecoverable for the app.

## 8. Task list (will be atomized into TASKS.md)

Execution order. /atomize will set allowed/forbidden files per atom.

1. **S1.7.0 — F0 prerequisite (NOT part of this plan; run first as its own one-commit cycle).** See `docs/specs/plan-v0.0.1-2.md` §7 F0. Adds "Product vocabulary" to `CLAUDE.md` + fixes `AGENTS.md` pointer. **Block this plan until F0 is committed.**
2. **S1.7.1 — Stubs + Builder skeleton + States.**
   - Cargo: add `specta-typescript = "0.0.9"` to `[dependencies]` in `apps/desktop/src-tauri/Cargo.toml`.
   - Create `commands/mod.rs` with 12 `#[tauri::command] #[specta::specta]` functions, each body = `unimplemented!("S1.7.3")`.
   - Create `run_registry.rs` with `RunRegistry::{new, register, cancel}` (full impl — not stubbed; trivial).
   - Create `bindings_export.rs` (new file) hosting `pub(crate) fn build_specta_builder() -> tauri_specta::Builder<tauri::Wry>` — the single source of the `.commands(collect_commands![...])` + `.typ::<...>()` chain. Reused by `lib.rs run()` and the export test in S1.7.2.
   - Modify `lib.rs`: add `use tauri::Manager;`, the new `pub mod` lines, call `bindings_export::build_specta_builder()` instead of inlining the Builder, wire `.invoke_handler(specta_builder.invoke_handler())`, then `.setup(...)` performing DB path resolution + `app.manage(db_state)` + `app.manage(RunRegistry::new())` + `setup_builder.mount_events(app)`.
   - Modify `claude_cli/install.rs:17` — add `Serialize, specta::Type` to the derive on `ClaudeInstall` and add `#[serde(tag="kind", rename_all="snake_case")]`.
   - Add `apps/desktop/src/app/_bindings.ts` to root `.gitignore`.
   - Gate: `cargo check` clean.
3. **S1.7.2 — Specta export + bindings round-trip.**
   - Add the `#[cfg(debug_assertions)] specta_builder.export(...)` call to `lib.rs run()`.
   - Add a Rust integration test in `tests/bindings_export.rs` (a top-level crate-level test file, not inside `commands/mod.rs`) that calls `bindings_export::build_specta_builder().export(Typescript::default(), tmp_path)` and asserts the produced file contains: `"listRepos"`, `"addRepo"`, ..., `"archiveWorkspace"`, `"AppError"`, `"StreamEvent"`, `"ClaudeInstall"`, `"Workspace"`. Exercises the export path without needing the Tauri runtime, and keeps the Builder construction de-duplicated between prod + test.
   - Manual smoke: `pnpm nx serve desktop` (boots tauri-dev → debug build → triggers the `cfg(debug_assertions)` export call); assert `apps/desktop/src/app/_bindings.ts` is written and non-empty.
   - Gate: `cargo test --tests` green; the new export test passes.
4. **S1.7.3 — Wire each command body.**
   - Add `repos::get(conn, repo_id) -> Result<Repo, AppError>` to `db/repos.rs` + round-trip test.
   - Replace every `unimplemented!()` in `commands/mod.rs` with the bodies in §6 (using `db.inner()` for any call expecting `&DbState`).
   - Add one happy-path `#[tokio::test]` per command (12 tests, in-memory DB; commands taking `State<DbState>` are exercised by calling the function body's inner logic directly with a fresh `DbState`). Plus one unhappy-path test for `discard_workspace_changes` with no prior run → `AppError::Validation`.
   - Gate: `cargo test --tests` green; clippy clean.
5. **S1.7.4 — Step 1.7 final gate.**
   - `cd apps/desktop/src-tauri && cargo check && cargo test --tests && cargo clippy --all-targets -- -D warnings`
   - `pnpm nx run-many -t typecheck lint`
   - `pnpm nx build desktop` (regenerates `_bindings.ts`; Step 1.8 will consume it)
   - Naming guard `grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"` → 0 hits
   - Vocabulary guard: `grep -n '"worktree_path"\|"branch_name"\|"agent/wip-"' apps/desktop/src-tauri/src/commands/` → 0 hits in **arguments** (return shapes are OK — DB row fields)

## 9. Validation gate

```sh
# Rust
cd apps/desktop/src-tauri && cargo check
cd apps/desktop/src-tauri && cargo test --tests                            # +15 new tests (1 export + 12 commands + 1 unhappy discard + 1 repos::get)
cd apps/desktop/src-tauri && cargo clippy --all-targets -- -D warnings

# Bindings round-trip — `cargo test --tests bindings_export` is the
# authoritative gate (runs the same Builder used by lib.rs::run()).
cd apps/desktop/src-tauri && cargo test --tests bindings_export -- --nocapture

# Optional manual smoke: pnpm nx serve desktop (boots tauri-dev, triggers
# the debug-only export in lib.rs::run(), writes _bindings.ts to disk).

# JS/TS
pnpm nx run-many -t typecheck lint

# Guards
grep -rn "conductor" apps/ libs/ --include="*.rs" --include="*.ts"          # expect 0 lines outside docs/competitors/conductor/
```

The `bindings_export` integration test is the deterministic gate. The `pnpm nx serve desktop` manual step is a smoke check — useful for Step 1.8 dev work but not part of the CI gate (it requires booting the tauri runtime and is racy in CI).

## 10. Rollback

- `git revert` the S1.7.* commits. All changes are additive to existing files except `lib.rs` (rewrite of `run()`) and `db/models.rs` (derive additions). Revert restores the pre-1.7 boilerplate `run()`.
- `_bindings.ts` is gitignored — no revert needed; it's a build artifact.
- No schema changes — no DB migration to undo.
- `RunRegistry` is in-memory; no on-disk state to clean.

## 11. Open questions

(none — all blocking decisions resolved before drafting; see §4)

## 12. Confidence

**9/10 (post-review pass 2)** — Two review iterations have run. Pass 1 caught 5 BLOCKING repo-accuracy + pseudocode-correctness errors; pass 2 caught 2 BLOCKING visibility/declaration errors introduced by the `bindings_export.rs` split, plus a logger-consistency conflict. All are addressed in-place. The 12-command surface maps 1:1 to verified service signatures. Residual single-point risk: `tauri_specta::Builder::clone()` being a real method in 2.0.0-rc.21 — if it isn't, the implementer constructs two independent builders (one for `invoke_handler`, one for `mount_events`), bounded to one atom. Not enough to drop confidence below 9.
