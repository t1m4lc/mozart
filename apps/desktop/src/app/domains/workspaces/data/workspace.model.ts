import type { UiWorkspaceStatus } from './workspace-status';

// UI ViewModel — purposefully free of any git/worktree vocabulary.
// `name` is the user-visible workspace name (singer pool — e.g. "eminem").
// `projectId` links back to the owning Project (Tauri side: `repo_id`,
// resolved via the joined Task row during hydration).
// `pending` flags the optimistic ghost row inserted during creation
// before the Tauri round-trip resolves.
export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  status: UiWorkspaceStatus;
  pinned: boolean;
  unread: boolean;
  pending: boolean;
  createdAt: Date;
}
