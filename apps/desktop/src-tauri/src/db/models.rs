//! Row structs mirroring the SQL schema (migrations/001_init.sql).
//!
//! Naming + types match the SQL exactly:
//! - IDs are `String` (TEXT PRIMARY KEY UUIDv4)
//! - Timestamps are `i64` Unix milliseconds (INTEGER)
//! - Optional columns are `Option<T>`
//!
//! All structs are serde + specta-typed so they can cross to Angular
//! via `#[tauri::command]` returns (Step 1.7).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Repo {
    pub repo_id: String,
    pub path: String,
    pub display_name: String,
    pub added_at: i64,
    pub icon: Option<String>,
    pub hidden: bool,
    pub sort_index: i64,
    /// Optional dev/run command (e.g. `pnpm dev`) Phase 4e's Run tab
    /// invokes inside a workspace's worktree.
    pub run_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Task {
    pub task_id: String,
    pub repo_id: String,
    pub title: String,
    pub task_text: String,
    pub status: String, // "active" | "archived"
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Workspace {
    pub workspace_id: String,
    pub task_id: String,
    pub name: String,
    pub worktree_path: String,
    pub branch_name: String,
    pub base_branch: String,
    pub status: String, // initializing | ready | running | done | error | conflict | stopped | crashed
    pub pinned: bool,
    pub unread: bool,
    pub created_at: i64,
    pub deletion_intent: i64,
    pub ui_status: String, // backlog | in_progress | in_review | done | canceled
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Thread {
    pub thread_id: String,
    pub workspace_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AgentRun {
    pub run_id: String,
    pub thread_id: String,
    pub prompt: String,
    pub status: String, // initializing | running | done | error | stopped | crashed
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub exit_code: Option<i64>,
    pub error_message: Option<String>,
    pub checkpoint_sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AgentEvent {
    pub event_id: i64,
    pub run_id: String,
    pub event_type: String, // stream_token | tool_call | cli_output | status_update | error
    pub payload_json: String,
    pub ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WorkspaceChange {
    pub change_id: i64,
    pub workspace_id: String,
    pub run_id: Option<String>,
    pub diff_text: String,
    pub files_added: i64,
    pub files_modified: i64,
    pub files_deleted: i64,
    pub captured_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OutboxEvent {
    pub outbox_id: i64,
    pub event_name: String,
    pub props_json: String,
    pub enqueued_at: i64,
    pub attempts: i64,
    pub last_attempt: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ConfigEntry {
    pub key: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Chat {
    pub chat_id: String,
    pub workspace_id: String,
    pub title: String,
    pub llm_id: Option<String>,
    pub mode: String,   // agent | plan | ask  (validated server-side)
    pub effort: String, // low | medium | high | xhigh | max
    pub last_read_message_id: Option<String>,
    pub closed_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Message {
    pub message_id: String,
    pub chat_id: String,
    pub run_id: Option<String>,
    pub role: String,    // user | assistant | system
    pub content: String,
    pub mode: Option<String>, // normal | plan
    pub status: String,  // pending | queued | streaming | done | error | stopped
    pub timeline_json: Option<String>,
    pub created_at: i64,
}
