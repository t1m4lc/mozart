import type { UiWorkspaceStatus } from './workspace-status';

// UI ViewModel — purposefully free of any git/worktree vocabulary.
// `title` is the user-visible workspace name (derived from Task.title).
// `projectId` links back to the owning Project (Tauri side: `repo_id`).
export interface Workspace {
  id: string;
  projectId: string;
  title: string;
  status: UiWorkspaceStatus;
  pinned: boolean;
  unread: boolean;
  createdAt: Date;
}
