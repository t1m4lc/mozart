//! Local-DB reset + demo seed.
//!
//! Two entry points:
//!
//! - [`reset_clean`] — wipes every domain table inside a single transaction,
//!   leaving the schema in place. Used by the dev `reset_database_clean`
//!   Tauri command.
//!
//! - [`reset_with_demo_seed`] — calls `reset_clean` then inserts a deterministic
//!   demo dataset (varied repos / tasks / workspaces / chats / messages /
//!   agent_runs / events / diffs) for UI screenshots and landing-page visuals.
//!   Used by the dev `reset_database_with_demo_seed` Tauri command.
//!
//! Neither runs on startup. Both are intentionally debug-only at the
//! command layer (see `commands::reset_database_*`).
//!
//! Calling from devtools:
//! ```js
//! // Wipe everything, no data after:
//! await window.__TAURI_INTERNALS__.invoke('reset_database_clean');
//! // Wipe + insert the demo dataset:
//! await window.__TAURI_INTERNALS__.invoke('reset_database_with_demo_seed');
//! ```

use rusqlite::Connection;

use crate::db::models::{
    AgentRun, Chat, Message, Repo, Task, Thread, Workspace, WorkspaceChange,
};
use crate::db::{
    agent_events, agent_runs, chats, messages, repos, tasks, threads,
    workspace_active_chat, workspace_changes, workspaces,
};
use crate::error::AppError;

/// Tables wiped by [`reset_clean`], in reverse-FK order so the delete pass
/// stays valid even with `foreign_keys = ON`. `schema_version` is kept —
/// the schema itself is not torn down.
const WIPE_ORDER: &[&str] = &[
    "agent_events",
    "workspace_changes",
    "messages",
    "workspace_active_chat",
    "chats",
    "agent_runs",
    "threads",
    "workspaces",
    "tasks",
    "repos",
    "events_outbox",
    "config",
];

/// Autoincrement tables whose `sqlite_sequence` counter we reset so a
/// freshly-seeded DB starts every rowid at 1 again. Without this the IDs
/// drift across repeated demo resets, which makes screenshot diffs noisy.
const AUTOINC_TABLES: &[&str] = &["agent_events", "workspace_changes", "events_outbox"];

/// Wipe all user data. Schema (and `schema_version`) is preserved.
/// Runs as a single transaction; either everything is gone or nothing is.
pub fn reset_clean(conn: &mut Connection) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    for table in WIPE_ORDER {
        tx.execute(&format!("DELETE FROM {table}"), [])?;
    }
    // `sqlite_sequence` only exists once at least one AUTOINCREMENT row
    // has been inserted in the DB's lifetime; missing-table is fine.
    let has_seq: i64 = tx.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
        [],
        |r| r.get(0),
    )?;
    if has_seq == 1 {
        for table in AUTOINC_TABLES {
            tx.execute(
                "DELETE FROM sqlite_sequence WHERE name = ?1",
                [table],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Wipe + insert the demo dataset. Transactional: a failure mid-seed
/// rolls back to the post-`reset_clean` empty state.
pub fn reset_with_demo_seed(conn: &mut Connection) -> Result<(), AppError> {
    reset_clean(conn)?;
    let tx = conn.transaction()?;
    seed::insert_all(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Deterministic demo dataset. All IDs are hardcoded UUID-shaped strings;
/// all timestamps are `now_ms() - offset_days * DAY_MS` so the "X days ago"
/// labels stay fresh while ordering is reproducible across runs.
mod seed {
    use super::*;
    use crate::db::now_ms;

    const DAY_MS: i64 = 86_400_000;
    const HOUR_MS: i64 = 3_600_000;
    const MIN_MS: i64 = 60_000;

    /// Stable UUID-shaped strings. The schema stores IDs as `TEXT`, so
    /// any unique string works; using deterministic names keeps screenshot
    /// state byte-identical across reseeds.
    pub(super) mod ids {
        // Repos
        pub const REPO_DESKTOP: &str = "d0000001-0000-4000-8000-000000000001";
        pub const REPO_DOCS:    &str = "d0000001-0000-4000-8000-000000000002";
        pub const REPO_LANDING: &str = "d0000001-0000-4000-8000-000000000003";
        pub const REPO_RLS:     &str = "d0000001-0000-4000-8000-000000000004";
        pub const REPO_LEGACY:  &str = "d0000001-0000-4000-8000-000000000005";
        pub const REPO_EMPTY:   &str = "d0000001-0000-4000-8000-000000000006";
        pub const REPO_AI:      &str = "d0000001-0000-4000-8000-000000000007";

        // Tasks (T0-prefixed → desktop, T1 → docs, T2 → landing, T3 → rls, T4 → legacy, T7 → ai)
        pub const TASK_DESKTOP_FILE_TREE:     &str = "d0000002-0000-4000-8000-000000000001";
        pub const TASK_DESKTOP_DIFF_VIEW:     &str = "d0000002-0000-4000-8000-000000000002";
        pub const TASK_DESKTOP_RUN_TAB:       &str = "d0000002-0000-4000-8000-000000000003";
        pub const TASK_DOCS_RELEASE_NOTES:    &str = "d0000002-0000-4000-8000-000000000004";
        pub const TASK_DOCS_PROMPT_LIBRARY:   &str = "d0000002-0000-4000-8000-000000000005";
        pub const TASK_LANDING_LLMS_TXT:      &str = "d0000002-0000-4000-8000-000000000006";
        pub const TASK_LANDING_PRICING:       &str = "d0000002-0000-4000-8000-000000000007";
        pub const TASK_RLS_AUDIT_REPORT:      &str = "d0000002-0000-4000-8000-000000000008";
        pub const TASK_LEGACY_MIGRATION:      &str = "d0000002-0000-4000-8000-000000000009";
        pub const TASK_AI_LLAMACPP_SPIKE:     &str = "d0000002-0000-4000-8000-000000000010";

        // Workspaces (one per `Workspace` row below)
        pub const WS_DESKTOP_FILE_TREE_A:  &str = "d0000003-0000-4000-8000-000000000001";
        pub const WS_DESKTOP_FILE_TREE_B:  &str = "d0000003-0000-4000-8000-000000000002";
        pub const WS_DESKTOP_DIFF_VIEW:    &str = "d0000003-0000-4000-8000-000000000003";
        pub const WS_DESKTOP_RUN_TAB:      &str = "d0000003-0000-4000-8000-000000000004";
        pub const WS_DOCS_RELEASE_NOTES:   &str = "d0000003-0000-4000-8000-000000000005";
        pub const WS_DOCS_PROMPT_LIBRARY:  &str = "d0000003-0000-4000-8000-000000000006";
        pub const WS_LANDING_LLMS_TXT:     &str = "d0000003-0000-4000-8000-000000000007";
        pub const WS_LANDING_PRICING:      &str = "d0000003-0000-4000-8000-000000000008";
        pub const WS_RLS_AUDIT:            &str = "d0000003-0000-4000-8000-000000000009";
        pub const WS_LEGACY_MIGRATION:     &str = "d0000003-0000-4000-8000-000000000010";
        pub const WS_AI_LLAMACPP:          &str = "d0000003-0000-4000-8000-000000000011";
        pub const WS_AI_EXPERIMENT_PAUSED: &str = "d0000003-0000-4000-8000-000000000012";

        // Threads (1:1 with workspaces in v0.1.0-beta.1)
        pub const TH_DESKTOP_FILE_TREE_A:  &str = "d0000004-0000-4000-8000-000000000001";
        pub const TH_DESKTOP_FILE_TREE_B:  &str = "d0000004-0000-4000-8000-000000000002";
        pub const TH_DESKTOP_DIFF_VIEW:    &str = "d0000004-0000-4000-8000-000000000003";
        pub const TH_DESKTOP_RUN_TAB:      &str = "d0000004-0000-4000-8000-000000000004";
        pub const TH_DOCS_RELEASE_NOTES:   &str = "d0000004-0000-4000-8000-000000000005";
        pub const TH_DOCS_PROMPT_LIBRARY:  &str = "d0000004-0000-4000-8000-000000000006";
        pub const TH_LANDING_LLMS_TXT:     &str = "d0000004-0000-4000-8000-000000000007";
        pub const TH_LANDING_PRICING:      &str = "d0000004-0000-4000-8000-000000000008";
        pub const TH_RLS_AUDIT:            &str = "d0000004-0000-4000-8000-000000000009";
        pub const TH_LEGACY_MIGRATION:     &str = "d0000004-0000-4000-8000-000000000010";
        pub const TH_AI_LLAMACPP:          &str = "d0000004-0000-4000-8000-000000000011";
        pub const TH_AI_EXPERIMENT_PAUSED: &str = "d0000004-0000-4000-8000-000000000012";

        // Chats — sparse: only a subset of workspaces have chats, some have
        // 2-3, two stand out (user-only, error, empty).
        pub const CHAT_FILE_TREE_A_MAIN:   &str = "d0000005-0000-4000-8000-000000000001";
        pub const CHAT_FILE_TREE_A_PLAN:   &str = "d0000005-0000-4000-8000-000000000002";
        pub const CHAT_FILE_TREE_B_MAIN:   &str = "d0000005-0000-4000-8000-000000000003";
        pub const CHAT_DIFF_VIEW_MAIN:     &str = "d0000005-0000-4000-8000-000000000004";
        pub const CHAT_RUN_TAB_MAIN:       &str = "d0000005-0000-4000-8000-000000000005";
        pub const CHAT_RELEASE_NOTES_MAIN: &str = "d0000005-0000-4000-8000-000000000006";
        pub const CHAT_PROMPT_LIB_MAIN:    &str = "d0000005-0000-4000-8000-000000000007";
        pub const CHAT_PROMPT_LIB_ASK:     &str = "d0000005-0000-4000-8000-000000000008";
        pub const CHAT_LLMS_TXT_MAIN:      &str = "d0000005-0000-4000-8000-000000000009";
        pub const CHAT_PRICING_USER_ONLY:  &str = "d0000005-0000-4000-8000-000000000010";
        pub const CHAT_RLS_CLOSED:         &str = "d0000005-0000-4000-8000-000000000011";
        pub const CHAT_LEGACY_ERROR:       &str = "d0000005-0000-4000-8000-000000000012";
        pub const CHAT_LLAMACPP_EMPTY:     &str = "d0000005-0000-4000-8000-000000000013";

        // Agent runs (a handful, covering every persisted status)
        pub const RUN_FILE_TREE_A_DONE:    &str = "d0000006-0000-4000-8000-000000000001";
        pub const RUN_FILE_TREE_A_RUNNING: &str = "d0000006-0000-4000-8000-000000000002";
        pub const RUN_FILE_TREE_B_DONE:    &str = "d0000006-0000-4000-8000-000000000003";
        pub const RUN_DIFF_VIEW_INIT:      &str = "d0000006-0000-4000-8000-000000000004";
        pub const RUN_RUN_TAB_STOPPED:     &str = "d0000006-0000-4000-8000-000000000005";
        pub const RUN_RELEASE_NOTES_DONE:  &str = "d0000006-0000-4000-8000-000000000006";
        pub const RUN_LLMS_TXT_DONE:       &str = "d0000006-0000-4000-8000-000000000007";
        pub const RUN_RLS_DONE:            &str = "d0000006-0000-4000-8000-000000000008";
        pub const RUN_LEGACY_CRASHED:      &str = "d0000006-0000-4000-8000-000000000009";

        // Messages — leading character `m` to keep them grep-distinct
        pub const MSG_FT_A_U1: &str = "d0000007-0000-4000-8000-000000000001";
        pub const MSG_FT_A_A1: &str = "d0000007-0000-4000-8000-000000000002";
        pub const MSG_FT_A_U2: &str = "d0000007-0000-4000-8000-000000000003";
        pub const MSG_FT_A_A2: &str = "d0000007-0000-4000-8000-000000000004";
        pub const MSG_FT_A_PLAN_U: &str = "d0000007-0000-4000-8000-000000000005";
        pub const MSG_FT_A_PLAN_A: &str = "d0000007-0000-4000-8000-000000000006";
        pub const MSG_FT_B_U1: &str = "d0000007-0000-4000-8000-000000000007";
        pub const MSG_FT_B_A1: &str = "d0000007-0000-4000-8000-000000000008";
        pub const MSG_DV_U1: &str = "d0000007-0000-4000-8000-000000000009";
        pub const MSG_DV_A1_STREAMING: &str = "d0000007-0000-4000-8000-000000000010";
        pub const MSG_RT_U1: &str = "d0000007-0000-4000-8000-000000000011";
        pub const MSG_RT_A1_STOPPED: &str = "d0000007-0000-4000-8000-000000000012";
        pub const MSG_RN_U1: &str = "d0000007-0000-4000-8000-000000000013";
        pub const MSG_RN_A1: &str = "d0000007-0000-4000-8000-000000000014";
        pub const MSG_PL_U1: &str = "d0000007-0000-4000-8000-000000000015";
        pub const MSG_PL_A1: &str = "d0000007-0000-4000-8000-000000000016";
        pub const MSG_PL_ASK_U1: &str = "d0000007-0000-4000-8000-000000000017";
        pub const MSG_PL_ASK_A1: &str = "d0000007-0000-4000-8000-000000000018";
        pub const MSG_LT_U1: &str = "d0000007-0000-4000-8000-000000000019";
        pub const MSG_LT_A1: &str = "d0000007-0000-4000-8000-000000000020";
        pub const MSG_PRI_U_ONLY: &str = "d0000007-0000-4000-8000-000000000021";
        pub const MSG_RLS_U1: &str = "d0000007-0000-4000-8000-000000000022";
        pub const MSG_RLS_A1: &str = "d0000007-0000-4000-8000-000000000023";
        pub const MSG_LEG_U1: &str = "d0000007-0000-4000-8000-000000000024";
        pub const MSG_LEG_A1_ERROR: &str = "d0000007-0000-4000-8000-000000000025";
    }

    pub fn insert_all(conn: &Connection) -> Result<(), AppError> {
        let now = now_ms();
        insert_repos(conn, now)?;
        insert_tasks(conn, now)?;
        insert_workspaces(conn, now)?;
        insert_threads(conn, now)?;
        insert_chats(conn, now)?;
        insert_active_chats(conn)?;
        insert_agent_runs(conn, now)?;
        insert_messages(conn, now)?;
        insert_agent_events(conn, now)?;
        insert_workspace_changes(conn, now)?;
        Ok(())
    }

    fn insert_repos(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            Repo {
                repo_id: ids::REPO_DESKTOP.into(),
                path: "/home/demo/code/mozart-desktop".into(),
                display_name: "Mozart Desktop".into(),
                added_at: now - 45 * DAY_MS,
                icon: Some("desktop".into()),
                hidden: false,
                sort_index: 0,
                run_command: Some("pnpm nx serve desktop".into()),
            },
            Repo {
                repo_id: ids::REPO_DOCS.into(),
                path: "/home/demo/code/mozart-docs".into(),
                display_name: "Mozart Docs".into(),
                added_at: now - 60 * DAY_MS,
                icon: Some("book".into()),
                hidden: false,
                sort_index: 1,
                run_command: None,
            },
            Repo {
                repo_id: ids::REPO_LANDING.into(),
                path: "/home/demo/code/mozart-landing".into(),
                display_name: "Mozart Landing".into(),
                added_at: now - 30 * DAY_MS,
                icon: Some("globe".into()),
                hidden: false,
                sort_index: 2,
                run_command: Some("pnpm nx serve landing".into()),
            },
            Repo {
                repo_id: ids::REPO_RLS.into(),
                path: "/home/demo/code/supabase-rls-audit".into(),
                display_name: "Supabase RLS Audit".into(),
                added_at: now - 90 * DAY_MS,
                icon: Some("lock".into()),
                hidden: false,
                sort_index: 3,
                run_command: None,
            },
            Repo {
                // Path that won't resolve on disk → surfaces as "inaccessible" in the UI.
                repo_id: ids::REPO_LEGACY.into(),
                path: "/home/demo/old-machine/legacy-angular-dashboard".into(),
                display_name: "Legacy Angular Dashboard".into(),
                added_at: now - 120 * DAY_MS,
                icon: Some("archive".into()),
                hidden: false,
                sort_index: 4,
                run_command: None,
            },
            Repo {
                repo_id: ids::REPO_EMPTY.into(),
                path: "/home/demo/code/empty-starter".into(),
                display_name: "Empty Starter Project".into(),
                added_at: now - 7 * DAY_MS,
                icon: Some("box".into()),
                hidden: false,
                sort_index: 5,
                run_command: None,
            },
            Repo {
                repo_id: ids::REPO_AI.into(),
                path: "/home/demo/code/local-ai-sandbox".into(),
                display_name: "Local AI Sandbox".into(),
                added_at: now - 150 * DAY_MS,
                icon: Some("flask".into()),
                hidden: false,
                sort_index: 6,
                run_command: Some("uv run main.py".into()),
            },
        ];
        for r in &rows {
            repos::create(conn, r)?;
        }
        Ok(())
    }

    fn insert_tasks(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            // Mozart Desktop — three active tasks
            Task {
                task_id: ids::TASK_DESKTOP_FILE_TREE.into(),
                repo_id: ids::REPO_DESKTOP.into(),
                title: "File tree virtualization".into(),
                task_text: "Make the repo file tree virtualized so 5k-file repos stay smooth.".into(),
                status: "active".into(),
                created_at: now - 14 * DAY_MS,
            },
            Task {
                task_id: ids::TASK_DESKTOP_DIFF_VIEW.into(),
                repo_id: ids::REPO_DESKTOP.into(),
                title: "Diff view side-by-side mode".into(),
                task_text: "Add a side-by-side variant of the diff view toggleable from the toolbar.".into(),
                status: "active".into(),
                created_at: now - 9 * DAY_MS,
            },
            Task {
                task_id: ids::TASK_DESKTOP_RUN_TAB.into(),
                repo_id: ids::REPO_DESKTOP.into(),
                title: "Run tab — restart command".into(),
                task_text: "Restart the workspace dev server without closing the PTY.".into(),
                status: "active".into(),
                created_at: now - 3 * DAY_MS,
            },
            // Mozart Docs — knowledge-base style tasks
            Task {
                task_id: ids::TASK_DOCS_RELEASE_NOTES.into(),
                repo_id: ids::REPO_DOCS.into(),
                title: "Draft v0.1.0-beta.1 release notes".into(),
                task_text: "Pull headline changes from CHANGELOG + plan and shape them for the announcement.".into(),
                status: "active".into(),
                created_at: now - 6 * DAY_MS,
            },
            Task {
                task_id: ids::TASK_DOCS_PROMPT_LIBRARY.into(),
                repo_id: ids::REPO_DOCS.into(),
                title: "Curate prompt library v1".into(),
                task_text: "Group existing prompts by surface (composer / plan / ask) and add usage notes.".into(),
                status: "active".into(),
                created_at: now - 21 * DAY_MS,
            },
            // Mozart Landing
            Task {
                task_id: ids::TASK_LANDING_LLMS_TXT.into(),
                repo_id: ids::REPO_LANDING.into(),
                title: "Generate llms.txt + llms-full.txt".into(),
                task_text: "Static-site generate AI-crawler endpoints from the marketing copy.".into(),
                status: "active".into(),
                created_at: now - 10 * DAY_MS,
            },
            Task {
                task_id: ids::TASK_LANDING_PRICING.into(),
                repo_id: ids::REPO_LANDING.into(),
                title: "Pricing page A/B variant".into(),
                task_text: "Test simplified three-tier pricing layout vs current four-tier.".into(),
                status: "active".into(),
                created_at: now - 2 * DAY_MS,
            },
            // Supabase RLS Audit — completed
            Task {
                task_id: ids::TASK_RLS_AUDIT_REPORT.into(),
                repo_id: ids::REPO_RLS.into(),
                title: "Compile RLS findings report".into(),
                task_text: "Roll the per-policy notes into a single audit report for the client.".into(),
                status: "archived".into(),
                created_at: now - 75 * DAY_MS,
            },
            // Legacy dashboard — old work, archived
            Task {
                task_id: ids::TASK_LEGACY_MIGRATION.into(),
                repo_id: ids::REPO_LEGACY.into(),
                title: "Migrate to Angular 17 control flow".into(),
                task_text: "Run the ng update + lint sweep across the dashboard surfaces.".into(),
                status: "archived".into(),
                created_at: now - 100 * DAY_MS,
            },
            // AI sandbox — paused
            Task {
                task_id: ids::TASK_AI_LLAMACPP_SPIKE.into(),
                repo_id: ids::REPO_AI.into(),
                title: "llama.cpp inference spike".into(),
                task_text: "Wire a local llama.cpp endpoint as a Claude-CLI fallback for offline demos.".into(),
                status: "archived".into(),
                created_at: now - 80 * DAY_MS,
            },
        ];
        for t in &rows {
            tasks::create(conn, t)?;
        }
        Ok(())
    }

    fn insert_workspaces(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            Workspace {
                workspace_id: ids::WS_DESKTOP_FILE_TREE_A.into(),
                task_id: ids::TASK_DESKTOP_FILE_TREE.into(),
                name: "eminem".into(),
                worktree_path: "/home/demo/code/mozart-desktop/.worktrees/eminem".into(),
                branch_name: "agent/eminem".into(),
                base_branch: "main".into(),
                status: "done".into(),
                pinned: true,
                unread: false,
                created_at: now - 13 * DAY_MS,
                deletion_intent: 0,
                ui_status: "in_review".into(),
            },
            Workspace {
                workspace_id: ids::WS_DESKTOP_FILE_TREE_B.into(),
                task_id: ids::TASK_DESKTOP_FILE_TREE.into(),
                name: "drake".into(),
                worktree_path: "/home/demo/code/mozart-desktop/.worktrees/drake".into(),
                branch_name: "agent/drake".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: false,
                unread: true,
                created_at: now - 12 * DAY_MS,
                deletion_intent: 0,
                ui_status: "in_progress".into(),
            },
            Workspace {
                workspace_id: ids::WS_DESKTOP_DIFF_VIEW.into(),
                task_id: ids::TASK_DESKTOP_DIFF_VIEW.into(),
                name: "kendrick".into(),
                worktree_path: "/home/demo/code/mozart-desktop/.worktrees/kendrick".into(),
                branch_name: "agent/kendrick".into(),
                base_branch: "main".into(),
                status: "running".into(),
                pinned: false,
                unread: true,
                created_at: now - 2 * DAY_MS + 4 * HOUR_MS,
                deletion_intent: 0,
                ui_status: "in_progress".into(),
            },
            Workspace {
                workspace_id: ids::WS_DESKTOP_RUN_TAB.into(),
                task_id: ids::TASK_DESKTOP_RUN_TAB.into(),
                name: "sza".into(),
                worktree_path: "/home/demo/code/mozart-desktop/.worktrees/sza".into(),
                branch_name: "agent/sza".into(),
                base_branch: "main".into(),
                status: "stopped".into(),
                pinned: false,
                unread: false,
                created_at: now - 1 * DAY_MS,
                deletion_intent: 0,
                ui_status: "backlog".into(),
            },
            Workspace {
                workspace_id: ids::WS_DOCS_RELEASE_NOTES.into(),
                task_id: ids::TASK_DOCS_RELEASE_NOTES.into(),
                name: "beethoven".into(),
                worktree_path: "/home/demo/code/mozart-docs/.worktrees/beethoven".into(),
                branch_name: "agent/beethoven".into(),
                base_branch: "main".into(),
                status: "done".into(),
                pinned: false,
                unread: false,
                created_at: now - 5 * DAY_MS,
                deletion_intent: 0,
                ui_status: "done".into(),
            },
            Workspace {
                workspace_id: ids::WS_DOCS_PROMPT_LIBRARY.into(),
                task_id: ids::TASK_DOCS_PROMPT_LIBRARY.into(),
                name: "mozart".into(),
                worktree_path: "/home/demo/code/mozart-docs/.worktrees/mozart".into(),
                branch_name: "agent/mozart".into(),
                base_branch: "main".into(),
                status: "ready".into(),
                pinned: true,
                unread: false,
                created_at: now - 18 * DAY_MS,
                deletion_intent: 0,
                ui_status: "in_progress".into(),
            },
            Workspace {
                workspace_id: ids::WS_LANDING_LLMS_TXT.into(),
                task_id: ids::TASK_LANDING_LLMS_TXT.into(),
                name: "bach".into(),
                worktree_path: "/home/demo/code/mozart-landing/.worktrees/bach".into(),
                branch_name: "agent/bach".into(),
                base_branch: "main".into(),
                status: "done".into(),
                pinned: false,
                unread: false,
                created_at: now - 9 * DAY_MS,
                deletion_intent: 0,
                ui_status: "done".into(),
            },
            Workspace {
                workspace_id: ids::WS_LANDING_PRICING.into(),
                task_id: ids::TASK_LANDING_PRICING.into(),
                name: "chopin".into(),
                worktree_path: "/home/demo/code/mozart-landing/.worktrees/chopin".into(),
                branch_name: "agent/chopin".into(),
                base_branch: "main".into(),
                status: "initializing".into(),
                pinned: false,
                unread: true,
                created_at: now - 2 * HOUR_MS,
                deletion_intent: 0,
                ui_status: "backlog".into(),
            },
            Workspace {
                workspace_id: ids::WS_RLS_AUDIT.into(),
                task_id: ids::TASK_RLS_AUDIT_REPORT.into(),
                name: "vivaldi".into(),
                worktree_path: "/home/demo/code/supabase-rls-audit/.worktrees/vivaldi".into(),
                branch_name: "agent/vivaldi".into(),
                base_branch: "main".into(),
                status: "done".into(),
                pinned: false,
                unread: false,
                created_at: now - 70 * DAY_MS,
                deletion_intent: 0,
                ui_status: "done".into(),
            },
            Workspace {
                workspace_id: ids::WS_LEGACY_MIGRATION.into(),
                task_id: ids::TASK_LEGACY_MIGRATION.into(),
                name: "salieri".into(),
                worktree_path: "/home/demo/old-machine/legacy-angular-dashboard/.worktrees/salieri".into(),
                branch_name: "agent/salieri".into(),
                base_branch: "main".into(),
                status: "crashed".into(),
                pinned: false,
                unread: false,
                created_at: now - 95 * DAY_MS,
                deletion_intent: 0,
                ui_status: "canceled".into(),
            },
            Workspace {
                workspace_id: ids::WS_AI_LLAMACPP.into(),
                task_id: ids::TASK_AI_LLAMACPP_SPIKE.into(),
                name: "haydn".into(),
                worktree_path: "/home/demo/code/local-ai-sandbox/.worktrees/haydn".into(),
                branch_name: "agent/haydn".into(),
                base_branch: "main".into(),
                status: "error".into(),
                pinned: false,
                unread: false,
                created_at: now - 78 * DAY_MS,
                deletion_intent: 0,
                ui_status: "canceled".into(),
            },
            Workspace {
                workspace_id: ids::WS_AI_EXPERIMENT_PAUSED.into(),
                task_id: ids::TASK_AI_LLAMACPP_SPIKE.into(),
                name: "schubert".into(),
                worktree_path: "/home/demo/code/local-ai-sandbox/.worktrees/schubert".into(),
                branch_name: "agent/schubert".into(),
                base_branch: "main".into(),
                status: "conflict".into(),
                pinned: false,
                unread: false,
                created_at: now - 65 * DAY_MS,
                deletion_intent: 0,
                ui_status: "in_review".into(),
            },
        ];
        for w in &rows {
            workspaces::create(conn, w)?;
        }
        Ok(())
    }

    fn insert_threads(conn: &Connection, now: i64) -> Result<(), AppError> {
        let pairs = [
            (ids::TH_DESKTOP_FILE_TREE_A,  ids::WS_DESKTOP_FILE_TREE_A,  13 * DAY_MS),
            (ids::TH_DESKTOP_FILE_TREE_B,  ids::WS_DESKTOP_FILE_TREE_B,  12 * DAY_MS),
            (ids::TH_DESKTOP_DIFF_VIEW,    ids::WS_DESKTOP_DIFF_VIEW,    2 * DAY_MS),
            (ids::TH_DESKTOP_RUN_TAB,      ids::WS_DESKTOP_RUN_TAB,      DAY_MS),
            (ids::TH_DOCS_RELEASE_NOTES,   ids::WS_DOCS_RELEASE_NOTES,   5 * DAY_MS),
            (ids::TH_DOCS_PROMPT_LIBRARY,  ids::WS_DOCS_PROMPT_LIBRARY,  18 * DAY_MS),
            (ids::TH_LANDING_LLMS_TXT,     ids::WS_LANDING_LLMS_TXT,     9 * DAY_MS),
            (ids::TH_LANDING_PRICING,      ids::WS_LANDING_PRICING,      2 * HOUR_MS),
            (ids::TH_RLS_AUDIT,            ids::WS_RLS_AUDIT,            70 * DAY_MS),
            (ids::TH_LEGACY_MIGRATION,     ids::WS_LEGACY_MIGRATION,     95 * DAY_MS),
            (ids::TH_AI_LLAMACPP,          ids::WS_AI_LLAMACPP,          78 * DAY_MS),
            (ids::TH_AI_EXPERIMENT_PAUSED, ids::WS_AI_EXPERIMENT_PAUSED, 65 * DAY_MS),
        ];
        for (tid, wid, ago) in pairs {
            threads::create(conn, &Thread {
                thread_id: tid.into(),
                workspace_id: wid.into(),
                created_at: now - ago,
            })?;
        }
        Ok(())
    }

    fn insert_chats(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            // file-tree A: main + plan side-chat
            Chat {
                chat_id: ids::CHAT_FILE_TREE_A_MAIN.into(),
                workspace_id: ids::WS_DESKTOP_FILE_TREE_A.into(),
                title: "Virtualize the tree".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "high".into(),
                last_read_message_id: Some(ids::MSG_FT_A_A2.into()),
                closed_at: None,
                created_at: now - 13 * DAY_MS,
            },
            Chat {
                chat_id: ids::CHAT_FILE_TREE_A_PLAN.into(),
                workspace_id: ids::WS_DESKTOP_FILE_TREE_A.into(),
                title: "Plan: row recycling".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "plan".into(),
                effort: "max".into(),
                last_read_message_id: Some(ids::MSG_FT_A_PLAN_A.into()),
                closed_at: None,
                created_at: now - 12 * DAY_MS + 3 * HOUR_MS,
            },
            // file-tree B
            Chat {
                chat_id: ids::CHAT_FILE_TREE_B_MAIN.into(),
                workspace_id: ids::WS_DESKTOP_FILE_TREE_B.into(),
                title: "Compare to Drake's approach".into(),
                llm_id: Some("claude-sonnet-4-6".into()),
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: None,
                closed_at: None,
                created_at: now - 12 * DAY_MS,
            },
            // diff view — currently streaming
            Chat {
                chat_id: ids::CHAT_DIFF_VIEW_MAIN.into(),
                workspace_id: ids::WS_DESKTOP_DIFF_VIEW.into(),
                title: "Side-by-side diff".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "high".into(),
                last_read_message_id: None,
                closed_at: None,
                created_at: now - 2 * DAY_MS + 4 * HOUR_MS,
            },
            // run-tab — was running, user stopped
            Chat {
                chat_id: ids::CHAT_RUN_TAB_MAIN.into(),
                workspace_id: ids::WS_DESKTOP_RUN_TAB.into(),
                title: "Restart without closing PTY".into(),
                llm_id: Some("claude-sonnet-4-6".into()),
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: Some(ids::MSG_RT_A1_STOPPED.into()),
                closed_at: None,
                created_at: now - 1 * DAY_MS,
            },
            // docs / release-notes
            Chat {
                chat_id: ids::CHAT_RELEASE_NOTES_MAIN.into(),
                workspace_id: ids::WS_DOCS_RELEASE_NOTES.into(),
                title: "Headline changes".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: Some(ids::MSG_RN_A1.into()),
                closed_at: None,
                created_at: now - 5 * DAY_MS,
            },
            // docs / prompt library — 2 chats, mixed modes
            Chat {
                chat_id: ids::CHAT_PROMPT_LIB_MAIN.into(),
                workspace_id: ids::WS_DOCS_PROMPT_LIBRARY.into(),
                title: "Group by surface".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "high".into(),
                last_read_message_id: Some(ids::MSG_PL_A1.into()),
                closed_at: None,
                created_at: now - 18 * DAY_MS,
            },
            Chat {
                chat_id: ids::CHAT_PROMPT_LIB_ASK.into(),
                workspace_id: ids::WS_DOCS_PROMPT_LIBRARY.into(),
                title: "How does Claude classify intents?".into(),
                llm_id: Some("claude-sonnet-4-6".into()),
                mode: "ask".into(),
                effort: "low".into(),
                last_read_message_id: Some(ids::MSG_PL_ASK_A1.into()),
                closed_at: None,
                created_at: now - 17 * DAY_MS,
            },
            // landing / llms.txt — done
            Chat {
                chat_id: ids::CHAT_LLMS_TXT_MAIN.into(),
                workspace_id: ids::WS_LANDING_LLMS_TXT.into(),
                title: "Generate the two endpoints".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: Some(ids::MSG_LT_A1.into()),
                closed_at: None,
                created_at: now - 9 * DAY_MS,
            },
            // landing / pricing — USER ONLY (no assistant reply yet)
            Chat {
                chat_id: ids::CHAT_PRICING_USER_ONLY.into(),
                workspace_id: ids::WS_LANDING_PRICING.into(),
                title: "Three-tier copy".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "plan".into(),
                effort: "high".into(),
                last_read_message_id: None,
                closed_at: None,
                created_at: now - HOUR_MS,
            },
            // RLS audit — closed chat
            Chat {
                chat_id: ids::CHAT_RLS_CLOSED.into(),
                workspace_id: ids::WS_RLS_AUDIT.into(),
                title: "Final report draft".into(),
                llm_id: Some("claude-opus-4-7".into()),
                mode: "agent".into(),
                effort: "high".into(),
                last_read_message_id: Some(ids::MSG_RLS_A1.into()),
                closed_at: Some(now - 70 * DAY_MS + 6 * HOUR_MS),
                created_at: now - 71 * DAY_MS,
            },
            // legacy — ERROR case
            Chat {
                chat_id: ids::CHAT_LEGACY_ERROR.into(),
                workspace_id: ids::WS_LEGACY_MIGRATION.into(),
                title: "ng update sweep".into(),
                llm_id: Some("claude-sonnet-4-6".into()),
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: Some(ids::MSG_LEG_A1_ERROR.into()),
                closed_at: None,
                created_at: now - 95 * DAY_MS,
            },
            // llama.cpp — EMPTY chat (no messages)
            Chat {
                chat_id: ids::CHAT_LLAMACPP_EMPTY.into(),
                workspace_id: ids::WS_AI_LLAMACPP.into(),
                title: "Untitled".into(),
                llm_id: None,
                mode: "agent".into(),
                effort: "medium".into(),
                last_read_message_id: None,
                closed_at: None,
                created_at: now - 78 * DAY_MS,
            },
        ];
        for c in &rows {
            chats::create(conn, c)?;
        }
        Ok(())
    }

    fn insert_active_chats(conn: &Connection) -> Result<(), AppError> {
        let pairs = [
            (ids::WS_DESKTOP_FILE_TREE_A,  ids::CHAT_FILE_TREE_A_MAIN),
            (ids::WS_DESKTOP_FILE_TREE_B,  ids::CHAT_FILE_TREE_B_MAIN),
            (ids::WS_DESKTOP_DIFF_VIEW,    ids::CHAT_DIFF_VIEW_MAIN),
            (ids::WS_DESKTOP_RUN_TAB,      ids::CHAT_RUN_TAB_MAIN),
            (ids::WS_DOCS_RELEASE_NOTES,   ids::CHAT_RELEASE_NOTES_MAIN),
            (ids::WS_DOCS_PROMPT_LIBRARY,  ids::CHAT_PROMPT_LIB_MAIN),
            (ids::WS_LANDING_LLMS_TXT,     ids::CHAT_LLMS_TXT_MAIN),
            (ids::WS_LANDING_PRICING,      ids::CHAT_PRICING_USER_ONLY),
            (ids::WS_RLS_AUDIT,            ids::CHAT_RLS_CLOSED),
            (ids::WS_LEGACY_MIGRATION,     ids::CHAT_LEGACY_ERROR),
            (ids::WS_AI_LLAMACPP,          ids::CHAT_LLAMACPP_EMPTY),
            // WS_AI_EXPERIMENT_PAUSED has no chat → no active row, exercising the
            // "workspace with zero chats" UI state.
        ];
        for (wid, cid) in pairs {
            workspace_active_chat::set(conn, wid, cid)?;
        }
        Ok(())
    }

    fn insert_agent_runs(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            AgentRun {
                run_id: ids::RUN_FILE_TREE_A_DONE.into(),
                thread_id: ids::TH_DESKTOP_FILE_TREE_A.into(),
                prompt: "Virtualize the file tree to handle 5k entries smoothly.".into(),
                status: "done".into(),
                started_at: now - 13 * DAY_MS + 30 * MIN_MS,
                ended_at: Some(now - 13 * DAY_MS + 38 * MIN_MS),
                exit_code: Some(0),
                error_message: None,
                checkpoint_sha: Some("a1b2c3d4e5f60718293a4b5c6d7e8f9001020304".into()),
            },
            AgentRun {
                run_id: ids::RUN_FILE_TREE_A_RUNNING.into(),
                thread_id: ids::TH_DESKTOP_FILE_TREE_A.into(),
                prompt: "Follow-up: handle the keyboard navigation cases too.".into(),
                status: "running".into(),
                started_at: now - 30 * MIN_MS,
                ended_at: None,
                exit_code: None,
                error_message: None,
                checkpoint_sha: Some("b2c3d4e5f60718293a4b5c6d7e8f900102030405".into()),
            },
            AgentRun {
                run_id: ids::RUN_FILE_TREE_B_DONE.into(),
                thread_id: ids::TH_DESKTOP_FILE_TREE_B.into(),
                prompt: "Try the row-recycling approach instead.".into(),
                status: "done".into(),
                started_at: now - 12 * DAY_MS + HOUR_MS,
                ended_at: Some(now - 12 * DAY_MS + HOUR_MS + 12 * MIN_MS),
                exit_code: Some(0),
                error_message: None,
                checkpoint_sha: Some("c3d4e5f60718293a4b5c6d7e8f90010203040506".into()),
            },
            AgentRun {
                run_id: ids::RUN_DIFF_VIEW_INIT.into(),
                thread_id: ids::TH_DESKTOP_DIFF_VIEW.into(),
                prompt: "Build the side-by-side diff variant.".into(),
                status: "initializing".into(),
                started_at: now - 90_000,
                ended_at: None,
                exit_code: None,
                error_message: None,
                checkpoint_sha: None,
            },
            AgentRun {
                run_id: ids::RUN_RUN_TAB_STOPPED.into(),
                thread_id: ids::TH_DESKTOP_RUN_TAB.into(),
                prompt: "Restart the run-tab PTY without closing the channel.".into(),
                status: "stopped".into(),
                started_at: now - DAY_MS + 2 * HOUR_MS,
                ended_at: Some(now - DAY_MS + 2 * HOUR_MS + 4 * MIN_MS),
                exit_code: None,
                error_message: Some("user cancelled".into()),
                checkpoint_sha: Some("d4e5f60718293a4b5c6d7e8f9001020304050607".into()),
            },
            AgentRun {
                run_id: ids::RUN_RELEASE_NOTES_DONE.into(),
                thread_id: ids::TH_DOCS_RELEASE_NOTES.into(),
                prompt: "Draft v0.1.0-beta.1 release notes from CHANGELOG.".into(),
                status: "done".into(),
                started_at: now - 5 * DAY_MS,
                ended_at: Some(now - 5 * DAY_MS + 9 * MIN_MS),
                exit_code: Some(0),
                error_message: None,
                checkpoint_sha: Some("e5f60718293a4b5c6d7e8f900102030405060708".into()),
            },
            AgentRun {
                run_id: ids::RUN_LLMS_TXT_DONE.into(),
                thread_id: ids::TH_LANDING_LLMS_TXT.into(),
                prompt: "Generate llms.txt + llms-full.txt at build time.".into(),
                status: "done".into(),
                started_at: now - 9 * DAY_MS,
                ended_at: Some(now - 9 * DAY_MS + 14 * MIN_MS),
                exit_code: Some(0),
                error_message: None,
                checkpoint_sha: Some("f60718293a4b5c6d7e8f90010203040506070809".into()),
            },
            AgentRun {
                run_id: ids::RUN_RLS_DONE.into(),
                thread_id: ids::TH_RLS_AUDIT.into(),
                prompt: "Compile the RLS findings into the final audit report.".into(),
                status: "done".into(),
                started_at: now - 70 * DAY_MS,
                ended_at: Some(now - 70 * DAY_MS + 22 * MIN_MS),
                exit_code: Some(0),
                error_message: None,
                checkpoint_sha: Some("0718293a4b5c6d7e8f9001020304050607080910".into()),
            },
            AgentRun {
                run_id: ids::RUN_LEGACY_CRASHED.into(),
                thread_id: ids::TH_LEGACY_MIGRATION.into(),
                prompt: "Migrate to Angular 17 control flow.".into(),
                status: "crashed".into(),
                started_at: now - 95 * DAY_MS,
                ended_at: Some(now - 95 * DAY_MS + 47_000),
                exit_code: Some(139),
                error_message: Some("agent process exited with SIGSEGV".into()),
                checkpoint_sha: None,
            },
        ];
        for r in &rows {
            agent_runs::create(conn, r)?;
        }
        Ok(())
    }

    fn insert_messages(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            // file-tree A / main chat (full back-and-forth)
            msg(ids::MSG_FT_A_U1, ids::CHAT_FILE_TREE_A_MAIN, None,
                "user", "Virtualize the tree, but keep keyboard nav working.",
                Some("agent"), "done", None, now - 13 * DAY_MS + 30 * MIN_MS),
            msg(ids::MSG_FT_A_A1, ids::CHAT_FILE_TREE_A_MAIN, Some(ids::RUN_FILE_TREE_A_DONE),
                "assistant", "Switching to a windowed virtual scroller.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"read_file"}]}"#),
                now - 13 * DAY_MS + 31 * MIN_MS),
            msg(ids::MSG_FT_A_U2, ids::CHAT_FILE_TREE_A_MAIN, None,
                "user", "Looks good — what about keyboard focus when rows recycle?",
                Some("agent"), "done", None, now - 13 * DAY_MS + 36 * MIN_MS),
            msg(ids::MSG_FT_A_A2, ids::CHAT_FILE_TREE_A_MAIN, Some(ids::RUN_FILE_TREE_A_DONE),
                "assistant", "Tracking focus by node id, not DOM ref. Done.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"edit_file"}]}"#),
                now - 13 * DAY_MS + 38 * MIN_MS),

            // file-tree A / plan chat
            msg(ids::MSG_FT_A_PLAN_U, ids::CHAT_FILE_TREE_A_PLAN, None,
                "user", "Plan: how should we recycle rows?",
                Some("plan"), "done", None, now - 12 * DAY_MS + 3 * HOUR_MS),
            msg(ids::MSG_FT_A_PLAN_A, ids::CHAT_FILE_TREE_A_PLAN, None,
                "assistant", "Three-bucket recycler, keyed by tree depth. (plan)",
                None, "done", Some(r#"{"steps":[{"kind":"plan"}]}"#),
                now - 12 * DAY_MS + 3 * HOUR_MS + MIN_MS),

            // file-tree B
            msg(ids::MSG_FT_B_U1, ids::CHAT_FILE_TREE_B_MAIN, None,
                "user", "Try row recycling instead — compare wall-clock.",
                Some("agent"), "done", None, now - 12 * DAY_MS + HOUR_MS),
            msg(ids::MSG_FT_B_A1, ids::CHAT_FILE_TREE_B_MAIN, Some(ids::RUN_FILE_TREE_B_DONE),
                "assistant", "Row recycling is 1.8x faster on the 5k bench. Switching.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"bash"}]}"#),
                now - 12 * DAY_MS + HOUR_MS + 12 * MIN_MS),

            // diff view — currently streaming
            msg(ids::MSG_DV_U1, ids::CHAT_DIFF_VIEW_MAIN, None,
                "user", "Add a side-by-side variant toggleable from the toolbar.",
                Some("agent"), "done", None, now - 2 * DAY_MS + 4 * HOUR_MS),
            msg(ids::MSG_DV_A1_STREAMING, ids::CHAT_DIFF_VIEW_MAIN, Some(ids::RUN_DIFF_VIEW_INIT),
                "assistant", "Sketching the two-pane layout. Hunks aligned by line number…",
                None, "streaming", None, now - 90_000),

            // run-tab — stopped mid-flight
            msg(ids::MSG_RT_U1, ids::CHAT_RUN_TAB_MAIN, None,
                "user", "Restart without killing the channel — we lose scrollback.",
                Some("agent"), "done", None, now - DAY_MS + 2 * HOUR_MS),
            msg(ids::MSG_RT_A1_STOPPED, ids::CHAT_RUN_TAB_MAIN, Some(ids::RUN_RUN_TAB_STOPPED),
                "assistant", "Sending SIGTERM then re-spawning. Buffer is preserved by…",
                None, "stopped", None, now - DAY_MS + 2 * HOUR_MS + 3 * MIN_MS),

            // docs / release notes
            msg(ids::MSG_RN_U1, ids::CHAT_RELEASE_NOTES_MAIN, None,
                "user", "Pull headline changes from CHANGELOG.",
                Some("agent"), "done", None, now - 5 * DAY_MS),
            msg(ids::MSG_RN_A1, ids::CHAT_RELEASE_NOTES_MAIN, Some(ids::RUN_RELEASE_NOTES_DONE),
                "assistant", "Draft attached. Three sections: workflow, chat, performance.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"write_file"}]}"#),
                now - 5 * DAY_MS + 9 * MIN_MS),

            // docs / prompt library / main (agent)
            msg(ids::MSG_PL_U1, ids::CHAT_PROMPT_LIB_MAIN, None,
                "user", "Group prompts by surface (composer / plan / ask).",
                Some("agent"), "done", None, now - 18 * DAY_MS),
            msg(ids::MSG_PL_A1, ids::CHAT_PROMPT_LIB_MAIN, None,
                "assistant", "Done — composer surfaces grouped by intent, plan separated.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"write_file"}]}"#),
                now - 18 * DAY_MS + 17 * MIN_MS),
            // docs / prompt library / ask
            msg(ids::MSG_PL_ASK_U1, ids::CHAT_PROMPT_LIB_ASK, None,
                "user", "How does Claude classify intents internally?",
                Some("ask"), "done", None, now - 17 * DAY_MS),
            msg(ids::MSG_PL_ASK_A1, ids::CHAT_PROMPT_LIB_ASK, None,
                "assistant", "Short answer: it doesn't — intent is inferred per-turn.",
                None, "done", None, now - 17 * DAY_MS + 2 * MIN_MS),

            // landing / llms.txt
            msg(ids::MSG_LT_U1, ids::CHAT_LLMS_TXT_MAIN, None,
                "user", "Static-gen the two AI-crawler endpoints at build time.",
                Some("agent"), "done", None, now - 9 * DAY_MS),
            msg(ids::MSG_LT_A1, ids::CHAT_LLMS_TXT_MAIN, Some(ids::RUN_LLMS_TXT_DONE),
                "assistant", "Added an Analog build step that emits llms.txt and llms-full.txt.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"write_file"}]}"#),
                now - 9 * DAY_MS + 14 * MIN_MS),

            // landing / pricing — USER ONLY (no assistant reply yet)
            msg(ids::MSG_PRI_U_ONLY, ids::CHAT_PRICING_USER_ONLY, None,
                "user", "Plan: simplified three-tier copy, headline + 3 bullets each.",
                Some("plan"), "pending", None, now - HOUR_MS),

            // RLS audit — closed chat with full exchange
            msg(ids::MSG_RLS_U1, ids::CHAT_RLS_CLOSED, None,
                "user", "Compile the per-policy notes into a single report.",
                Some("agent"), "done", None, now - 70 * DAY_MS),
            msg(ids::MSG_RLS_A1, ids::CHAT_RLS_CLOSED, Some(ids::RUN_RLS_DONE),
                "assistant", "Report ready — 17 policies, 4 high-severity gaps flagged.",
                None, "done", Some(r#"{"steps":[{"kind":"tool_call","tool":"write_file"}]}"#),
                now - 70 * DAY_MS + 22 * MIN_MS),

            // legacy — ERROR case
            msg(ids::MSG_LEG_U1, ids::CHAT_LEGACY_ERROR, None,
                "user", "Run the ng update sweep + commit lint fixes.",
                Some("agent"), "done", None, now - 95 * DAY_MS),
            msg(ids::MSG_LEG_A1_ERROR, ids::CHAT_LEGACY_ERROR, Some(ids::RUN_LEGACY_CRASHED),
                "assistant", "Agent process exited with SIGSEGV — see logs.",
                None, "error", None, now - 95 * DAY_MS + 47_000),

            // CHAT_LLAMACPP_EMPTY intentionally has no messages.
        ];
        for m in &rows {
            messages::insert(conn, m)?;
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn msg(
        message_id: &str,
        chat_id: &str,
        run_id: Option<&str>,
        role: &str,
        content: &str,
        mode: Option<&str>,
        status: &str,
        timeline_json: Option<&str>,
        created_at: i64,
    ) -> Message {
        Message {
            message_id: message_id.into(),
            chat_id: chat_id.into(),
            run_id: run_id.map(Into::into),
            role: role.into(),
            content: content.into(),
            mode: mode.map(Into::into),
            status: status.into(),
            timeline_json: timeline_json.map(Into::into),
            created_at,
        }
    }

    fn insert_agent_events(conn: &Connection, now: i64) -> Result<(), AppError> {
        // A handful per representative run — keeps the timeline UI populated
        // without ballooning the seed size.
        let events: &[(&str, &str, &str, i64)] = &[
            (ids::RUN_FILE_TREE_A_DONE, "status_update",
                r#"{"status":"running"}"#, now - 13 * DAY_MS + 30 * MIN_MS + 1_000),
            (ids::RUN_FILE_TREE_A_DONE, "tool_call",
                r#"{"tool":"read_file","args":{"path":"file-tree.component.ts"}}"#,
                now - 13 * DAY_MS + 30 * MIN_MS + 4_000),
            (ids::RUN_FILE_TREE_A_DONE, "tool_call",
                r#"{"tool":"edit_file","args":{"path":"file-tree.component.ts"}}"#,
                now - 13 * DAY_MS + 33 * MIN_MS),
            (ids::RUN_FILE_TREE_A_DONE, "status_update",
                r#"{"status":"done"}"#, now - 13 * DAY_MS + 38 * MIN_MS),

            (ids::RUN_FILE_TREE_A_RUNNING, "status_update",
                r#"{"status":"running"}"#, now - 30 * MIN_MS + 500),
            (ids::RUN_FILE_TREE_A_RUNNING, "stream_token",
                r#"{"text":"Looking at the focus-tracking code…"}"#, now - 25 * MIN_MS),

            (ids::RUN_LEGACY_CRASHED, "status_update",
                r#"{"status":"running"}"#, now - 95 * DAY_MS + 500),
            (ids::RUN_LEGACY_CRASHED, "error",
                r#"{"message":"agent process exited with SIGSEGV","exit_code":139}"#,
                now - 95 * DAY_MS + 47_000),
        ];
        for (run_id, event_type, payload_json, ts) in events {
            agent_events::insert(conn, run_id, event_type, payload_json, *ts)?;
        }
        Ok(())
    }

    fn insert_workspace_changes(conn: &Connection, now: i64) -> Result<(), AppError> {
        let rows = [
            WorkspaceChange {
                change_id: 0,
                workspace_id: ids::WS_DESKTOP_FILE_TREE_A.into(),
                run_id: Some(ids::RUN_FILE_TREE_A_DONE.into()),
                diff_text: "diff --git a/file-tree.component.ts b/file-tree.component.ts\n\
                            @@\n- legacy render\n+ windowed virtual scroller\n".into(),
                files_added: 0,
                files_modified: 2,
                files_deleted: 0,
                captured_at: now - 13 * DAY_MS + 38 * MIN_MS,
            },
            WorkspaceChange {
                change_id: 0,
                workspace_id: ids::WS_DESKTOP_FILE_TREE_B.into(),
                run_id: Some(ids::RUN_FILE_TREE_B_DONE.into()),
                diff_text: "diff --git a/file-tree-row.ts b/file-tree-row.ts\n\
                            @@\n+ row recycler bucket\n".into(),
                files_added: 1,
                files_modified: 1,
                files_deleted: 0,
                captured_at: now - 12 * DAY_MS + HOUR_MS + 12 * MIN_MS,
            },
            WorkspaceChange {
                change_id: 0,
                workspace_id: ids::WS_LANDING_LLMS_TXT.into(),
                run_id: Some(ids::RUN_LLMS_TXT_DONE.into()),
                diff_text: "diff --git a/scripts/build-llms-txt.ts b/scripts/build-llms-txt.ts\n\
                            new file mode 100644\n".into(),
                files_added: 2,
                files_modified: 0,
                files_deleted: 0,
                captured_at: now - 9 * DAY_MS + 14 * MIN_MS,
            },
            WorkspaceChange {
                change_id: 0,
                workspace_id: ids::WS_RLS_AUDIT.into(),
                run_id: Some(ids::RUN_RLS_DONE.into()),
                diff_text: "diff --git a/reports/audit.md b/reports/audit.md\n\
                            new file mode 100644\n".into(),
                files_added: 1,
                files_modified: 0,
                files_deleted: 0,
                captured_at: now - 70 * DAY_MS + 22 * MIN_MS,
            },
        ];
        for c in &rows {
            workspace_changes::insert(conn, c)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db_memory;

    fn row_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn reset_clean_on_empty_db_is_noop() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_clean(&mut conn).unwrap();
        for t in WIPE_ORDER {
            assert_eq!(row_count(&conn, t), 0, "expected {t} empty");
        }
        // Schema itself is preserved.
        let v: i64 = conn
            .query_row("SELECT version FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert!(v >= 6);
    }

    #[test]
    fn reset_clean_empties_all_domain_tables() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        // Sanity: seed actually inserted something.
        assert!(row_count(&conn, "repos") > 0);
        assert!(row_count(&conn, "messages") > 0);
        reset_clean(&mut conn).unwrap();
        for t in WIPE_ORDER {
            assert_eq!(row_count(&conn, t), 0, "expected {t} empty after reset");
        }
    }

    #[test]
    fn demo_seed_populates_expected_row_counts() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        assert_eq!(row_count(&conn, "repos"), 7);
        assert_eq!(row_count(&conn, "tasks"), 10);
        assert_eq!(row_count(&conn, "workspaces"), 12);
        assert_eq!(row_count(&conn, "threads"), 12);
        assert_eq!(row_count(&conn, "chats"), 13);
        assert_eq!(row_count(&conn, "agent_runs"), 9);
        // 11 active-chat rows: one per workspace that has chats. The paused
        // ai workspace is intentionally left without one.
        assert_eq!(row_count(&conn, "workspace_active_chat"), 11);
        assert!(row_count(&conn, "messages") > 0);
        assert!(row_count(&conn, "agent_events") > 0);
        assert!(row_count(&conn, "workspace_changes") > 0);
    }

    #[test]
    fn demo_seed_covers_every_persisted_workspace_status() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        for status in [
            "initializing", "ready", "running", "done", "error", "conflict",
            "stopped", "crashed",
        ] {
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workspaces WHERE status = ?1",
                    [status],
                    |r| r.get(0),
                )
                .unwrap();
            assert!(n >= 1, "expected at least one workspace with status={status}");
        }
    }

    #[test]
    fn demo_seed_has_empty_and_user_only_and_error_chat_variants() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        // Empty chat: zero messages.
        let empty: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE chat_id = ?1",
                [seed::ids::CHAT_LLAMACPP_EMPTY],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(empty, 0);
        // User-only chat: one message, role='user', no assistant.
        let user_msgs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE chat_id = ?1 AND role = 'user'",
                [seed::ids::CHAT_PRICING_USER_ONLY],
                |r| r.get(0),
            )
            .unwrap();
        let asst_msgs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE chat_id = ?1 AND role = 'assistant'",
                [seed::ids::CHAT_PRICING_USER_ONLY],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(user_msgs, 1);
        assert_eq!(asst_msgs, 0);
        // Error chat: assistant message with status='error'.
        let err: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE chat_id = ?1 AND status = 'error'",
                [seed::ids::CHAT_LEGACY_ERROR],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(err, 1);
    }

    #[test]
    fn demo_seed_is_idempotent_across_two_runs() {
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        let counts_a: Vec<(String, i64)> = WIPE_ORDER
            .iter()
            .map(|t| (t.to_string(), row_count(&conn, t)))
            .collect();
        reset_with_demo_seed(&mut conn).unwrap();
        let counts_b: Vec<(String, i64)> = WIPE_ORDER
            .iter()
            .map(|t| (t.to_string(), row_count(&conn, t)))
            .collect();
        assert_eq!(counts_a, counts_b);
    }

    #[test]
    fn demo_seed_respects_foreign_keys() {
        // init_db_memory enables foreign_keys=ON; if any insert dangled,
        // seed would have already failed. Belt-and-braces: re-check every
        // FK explicitly via a join row count.
        let db = init_db_memory().unwrap();
        let mut conn = db.lock();
        reset_with_demo_seed(&mut conn).unwrap();
        let dangling_tasks: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks t \
                 LEFT JOIN repos r ON r.repo_id = t.repo_id \
                 WHERE r.repo_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dangling_tasks, 0);
        let dangling_ws: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspaces w \
                 LEFT JOIN tasks t ON t.task_id = w.task_id \
                 WHERE t.task_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dangling_ws, 0);
        let dangling_msgs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages m \
                 LEFT JOIN chats c ON c.chat_id = m.chat_id \
                 WHERE c.chat_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dangling_msgs, 0);
    }
}
