import { InjectionToken } from '@angular/core';
import type { InstallResult } from '../../../core/_bindings';
import type { OpenInToolId } from './open-in-tools';
import type { UiWorkspaceStatus } from './workspace-status';
import type { WorkspaceDto } from './workspace.dto';

// Domain-level alias for the Tauri install command result. Re-exported
// so features + facade don't need to reach into `core/_bindings`.
export type InstallPackagesResult = InstallResult;

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

  // Detect package manager (pnpm > yarn > npm) in the workspace's
  // worktree and run `<manager> install`. Returns ran=false when the
  // worktree has no package.json. Non-blocking from the caller's
  // perspective — AddProjectFlow fires this without awaiting and
  // toasts the outcome.
  installPackages(workspaceId: string): Promise<InstallPackagesResult>;

  /** Probe `$PATH` for known IDE binaries; returns the IDs of those
   *  resolved. Cached at boot by `IdeDetectionService`. */
  detectInstalledIdes(): Promise<readonly OpenInToolId[]>;

  /** Launch `ideId` against the workspace's worktree. The path is
   *  resolved Rust-side; the UI never sees it. */
  openInIde(workspaceId: string, ideId: OpenInToolId): Promise<void>;
}

export const WORKSPACES_ADAPTER = new InjectionToken<WorkspacesAdapter>(
  'WORKSPACES_ADAPTER',
);
