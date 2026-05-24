import { InjectionToken } from '@angular/core';
import type {
  MergeAction,
  OpenInToolId,
  UiWorkspaceStatus,
} from '@mozart/desktop-workspaces-util';
import type { WorkspaceDto } from './workspace.dto-mapper';

// Wire shapes returned by the Tauri install + merge commands. Declared
// locally so this lib has no inbound dep on apps/_bindings — the
// desktop app passes its generated DTOs into the adapter and
// TypeScript structural typing closes the bridge.
export interface InstallPackagesResult {
  readonly manager: string;
  readonly ran: boolean;
  readonly success: boolean;
  readonly message: string;
}

export interface MergeOutcome {
  readonly status: string;
  readonly conflicting_files: readonly string[];
}

/** Result of a successful `create_workspace_pr` call. Mirrors the
 *  GitHub REST response surface; declared locally so this lib has no
 *  inbound dep on `_bindings.ts`. The adapter impl maps `html_url`
 *  → `htmlUrl` at the boundary. */
export interface CreatedPr {
  readonly number: number;
  readonly htmlUrl: string;
}

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

  /** P1.1 — push the branch (idempotent) then open a GitHub PR via the
   *  REST API. Requires a stored GitHub token AND the project's origin
   *  resolving to `github.com/<owner>/<repo>`. Throws `AppError` on
   *  precondition failure; the wrapper in `WorkspacesFacade.createPr`
   *  layers status-transition semantics (D1/D2/D3) on top. */
  createPr(
    workspaceId: string,
    title: string,
    body: string,
    draft: boolean,
  ): Promise<CreatedPr>;
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
