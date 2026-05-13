// Raw shape returned by Tauri. Mirrors db.workspaces JOIN db.tasks.
// The backend exposes branch_name/worktree_path/base_branch in the DTO
// for diagnostic purposes only — they MUST NOT cross into the UI model.

import type { UiWorkspaceStatus } from './workspace-status';

export interface WorkspaceDto {
  workspace_id: string;
  task_id: string;
  task_title: string; // joined from db.tasks.title
  // Runtime status from the agent — separate from UI status.
  runtime_status: string;
  // Planned new columns — see MIGRATIONS.
  ui_status: UiWorkspaceStatus;
  pinned: number; // 0/1
  unread: number; // 0/1
  created_at: number; // unix ms
  // Internals — present in DTO for completeness, never read by the UI layer.
  branch_name: string;
  worktree_path: string;
  base_branch: string;
}
