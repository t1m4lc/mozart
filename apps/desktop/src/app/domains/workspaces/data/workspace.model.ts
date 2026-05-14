import type { UiWorkspaceStatus } from './workspace-status';

// UI ViewModel — purposefully free of any git/worktree vocabulary,
// with one exception: `branch` (the workspace's own git branch, e.g.
// "mozart/coltrane"). It is the only place where the model surfaces a
// real branch name, and it exists solely so the BranchPicker can mark
// it as "current" and filter it out of the selectable target list.
// Never rendered as a raw label outside the picker.
//
// `name` is the user-visible workspace name (singer pool — e.g. "eminem").
// `projectId` links back to the owning Project (Tauri side: `repo_id`,
// resolved via the joined Task row during hydration).
// `pending` flags the optimistic ghost row inserted during creation
// before the Tauri round-trip resolves.
export interface Workspace {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  /** Branch the workspace was forked from (defaults to the target
   * branch shown in the branch picker). */
  baseBranch: string;
  status: UiWorkspaceStatus;
  pinned: boolean;
  unread: boolean;
  pending: boolean;
  createdAt: Date;
}
