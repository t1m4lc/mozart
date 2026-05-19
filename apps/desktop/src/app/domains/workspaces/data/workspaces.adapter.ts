import { InjectionToken } from '@angular/core';
import type { InstallResult, MergeOutcome } from '../../../core/_bindings';
import type { OpenInToolId } from './open-in-tools';
import type { UiWorkspaceStatus } from './workspace-status';
import type { WorkspaceDto } from './workspace.dto';
import type { MergeAction } from './workspace.model';

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

  /** Plan P0.2.D — lift a workspace out of the frozen `done` state.
   *  Rust-side: flips ui_status to `targetUiStatus` (the status the
   *  user picked from the menu) and runtime status to `ready`. Returns
   *  Validation if the workspace isn't currently frozen or if the
   *  target is itself `done`. */
  reopen(workspaceId: string, targetUiStatus: UiWorkspaceStatus): Promise<void>;

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

  /** Aggregate per-workspace diff stats vs. each workspace's base
   *  branch. Sidebar workspace rows render the green `+N` / red `−N`
   *  chip from this map. Batched on the Rust side — one IPC call
   *  returns counts for all workspaces. */
  listDiffStats(): Promise<readonly WorkspaceDiffStatsEntry[]>;

  /** P2.6 / AD-02 — persist the user's last picked merge action for the
   *  right-aside primary-button label. Fire-and-forget from the menu
   *  click; outcome-independent. */
  setLastMergeAction(workspaceId: string, action: MergeAction): Promise<void>;

  /** P2.6 — run the six-step local merge flow. Returns the outcome the
   *  frontend uses to route toasts / mark conflicting files. */
  mergeLocally(workspaceId: string): Promise<MergeOutcome>;
}

/** Per-workspace aggregate line counts. Sums of `git diff --numstat`
 *  output across committed-vs-base and working-tree-vs-HEAD. */
export interface WorkspaceDiffStatsEntry {
  readonly workspaceId: string;
  readonly added: number;
  readonly removed: number;
}

export const WORKSPACES_ADAPTER = new InjectionToken<WorkspacesAdapter>(
  'WORKSPACES_ADAPTER',
);
