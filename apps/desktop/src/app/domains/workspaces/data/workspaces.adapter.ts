import { InjectionToken } from '@angular/core';
import type { UiWorkspaceStatus } from './workspace-status';
import type { WorkspaceDto } from './workspace.dto';

// Tauri-backed IO for the workspaces domain. Concrete impl bound in
// app.config.ts. The adapter is the ONLY surface in the Angular tree
// that may reference Tauri command names or `_bindings.ts` — no
// feature, store, or facade may invoke commands directly.
export interface WorkspacesAdapter {
  create(input: {
    projectId: string;
    baseBranch: string;
    taskText: string;
    workspaceName: string;
  }): Promise<WorkspaceDto>;

  list(): Promise<WorkspaceDto[]>;

  archive(workspaceId: string): Promise<void>;

  listBranches(repoPath: string): Promise<string[]>;

  rename(workspaceId: string, name: string): Promise<void>;

  setUiStatus(workspaceId: string, status: UiWorkspaceStatus): Promise<void>;

  setPinned(workspaceId: string, pinned: boolean): Promise<void>;

  setUnread(workspaceId: string, unread: boolean): Promise<void>;
}

export const WORKSPACES_ADAPTER = new InjectionToken<WorkspacesAdapter>(
  'WORKSPACES_ADAPTER',
);
