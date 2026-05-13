import type { UiWorkspaceStatus } from './workspace-status';

// UI ViewModel — purposefully free of any git/worktree vocabulary.
// `title` is the user-visible workspace name (derived from Task.title).
export interface Workspace {
  id: string;
  title: string;
  status: UiWorkspaceStatus;
  pinned: boolean;
  unread: boolean;
  createdAt: Date;
}
