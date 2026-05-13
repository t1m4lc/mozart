// Raw shape returned by Tauri. Re-exported so no other workspaces-domain
// file reaches into `core/_bindings`. The DTO carries internal git
// vocabulary (`worktree_path`, `branch_name`, `base_branch`) — those
// stay behind the adapter and never cross into the UI model.

export type { Workspace as WorkspaceDto } from '../../../core/_bindings';
