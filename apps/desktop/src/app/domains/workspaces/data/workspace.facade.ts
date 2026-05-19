import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ProjectsFacade } from '../../projects';
import { TasksFacade } from '../../tasks';
import { UiStateFacade } from '../../ui-state';
import { generateWorkspaceName } from '../util-workspace-name';
import { IdeDetectionService } from './ide-detection.service';
import type { OpenInToolId } from './open-in-tools';
import type { UiWorkspaceStatus } from './workspace-status';
import { workspaceFromDto } from './workspace.adapter';
import type { Workspace } from './workspace.model';
import { WorkspaceStore } from './workspace.store';
import {
  WORKSPACES_ADAPTER,
  type InstallPackagesResult,
} from './workspaces.adapter';

// Per-workspace package-manager install state, surfaced to the chat
// empty-state checklist (step 4 — "Setup script completed.").
export type InstallState =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'no_package';

export interface WorkspaceInstall {
  state: InstallState;
  manager: string;
}

const NO_INSTALL: WorkspaceInstall = { state: 'idle', manager: '' };

// Public API of the `workspaces` domain. Features inject this — never
// the store or adapter directly. Cross-domain calls to `projects` and
// `tasks` go through their facades (legal per Convention #2: domains
// only import each other through their public `index.ts`).
@Injectable({ providedIn: 'root' })
export class WorkspacesFacade {
  private readonly store = inject(WorkspaceStore);
  private readonly adapter = inject(WORKSPACES_ADAPTER);
  private readonly projects = inject(ProjectsFacade);
  private readonly tasks = inject(TasksFacade);
  private readonly ideDetection = inject(IdeDetectionService);
  private readonly uiState = inject(UiStateFacade);

  readonly all = this.store.workspaces;
  // Active workspace id is owned by domains/ui-state/. The facade
  // re-exposes it so historical consumers continue to work.
  readonly activeId = this.uiState.activeWorkspaceId;
  readonly pending = this.store.pending;

  // Per-workspace aggregate diff stats. Sidebar workspace rows read
  // their `+N` / `−N` from this map. Refreshed on hydrate + whenever a
  // workspace's FS watcher pings (driven from the aside).
  private readonly _diffStats = signal<ReadonlyMap<string, { added: number; removed: number }>>(
    new Map(),
  );
  readonly diffStats = this._diffStats.asReadonly();

  diffStatsFor(workspaceId: string) {
    return computed(() => this._diffStats().get(workspaceId) ?? null);
  }

  async refreshDiffStats(): Promise<void> {
    try {
      const list = await this.adapter.listDiffStats();
      const next = new Map<string, { added: number; removed: number }>();
      for (const s of list) {
        next.set(s.workspaceId, { added: s.added, removed: s.removed });
      }
      this._diffStats.set(next);
    } catch (e) {
      console.warn('[workspaces] refreshDiffStats failed:', e);
    }
  }

  byProject(projectId: string) {
    return computed(() => this.store.byProject().get(projectId) ?? []);
  }

  workspaceById(id: string) {
    return computed(
      () => this.store.workspaces().find((w) => w.id === id) ?? null,
    );
  }

  // True when the workspace is in a kanban-level "closed" state —
  // either `done` (work shipped) or `canceled` (work abandoned). Both
  // turn the workspace read-only; transitions between them are sideways
  // moves, not a reopen. Unknown ids resolve to `false` so callers don't
  // have to special-case "no workspace selected".
  isFrozen(workspaceId: string): Signal<boolean> {
    return computed(() => {
      const ws = this.store.workspaces().find((w) => w.id === workspaceId);
      return ws?.status === 'done' || ws?.status === 'canceled';
    });
  }

  /**
   * `true` when any **other** workspace in the same project as
   * `workspaceId` has `unread === true`. Drives the composer's
   * next-unread overlay button.
   */
  hasOtherUnreadInProject(
    workspaceId: Signal<string | null>,
  ): Signal<boolean> {
    return computed(() => this._nextUnreadId(workspaceId()) !== null);
  }

  /**
   * Returns the id of the next unread workspace in the same project as
   * `workspaceId`, or null. Picked deterministically (sidebar order).
   */
  nextUnreadInProject(workspaceId: string | null): string | null {
    return this._nextUnreadId(workspaceId);
  }

  private _nextUnreadId(workspaceId: string | null): string | null {
    if (!workspaceId) return null;
    const current = this.store.workspaces().find((w) => w.id === workspaceId);
    if (!current) return null;
    const siblings = this.store.byProject().get(current.projectId) ?? [];
    const match = siblings.find((w) => w.id !== workspaceId && w.unread);
    return match?.id ?? null;
  }

  setActive(id: string | null): void {
    this.uiState.setActiveWorkspace(id);
  }

  // ---- v0.1.0-beta.1 wiring -------------------------------------------------

  // Hydrate from Tauri. Loads tasks-for-each-project first so the
  // workspace -> project join is resolvable client-side, then loads
  // workspaces and filters out rows the backend has marked for deletion.
  async loadAll(): Promise<void> {
    const projects = this.projects.all();
    await Promise.all(
      projects.map((p) => this.tasks.loadForProject(p.id)),
    );
    const dtos = await this.adapter.list();
    const workspaces: Workspace[] = dtos
      .filter((d) => d.deletion_intent === 0)
      .map((d) => {
        const task = this.tasks.byId(d.task_id)();
        return workspaceFromDto(d, task?.projectId ?? '');
      })
      .filter((w) => w.projectId !== ''); // defensive: drop orphans
    this.store.setAll(workspaces);
    // Best-effort: kick off the diff-stats fetch without blocking the
    // hydrate. Sidebar rows render the chip once this resolves.
    void this.refreshDiffStats();
  }

  /** Probe `$PATH` for known IDEs and update the IdeDetectionService.
   *  Called from app initialization. */
  async detectIdes(): Promise<void> {
    try {
      const detected = await this.adapter.detectInstalledIdes();
      this.ideDetection.set(detected);
    } catch (err) {
      console.warn('[workspaces] detectInstalledIdes failed:', err);
    }
  }

  /** Launch `ideId` against the workspace's worktree. */
  async openInIde(workspaceId: string, ideId: OpenInToolId): Promise<void> {
    await this.adapter.openInIde(workspaceId, ideId);
  }

  // Creates a workspace from a single click on a project's "+ workspace"
  // affordance. The orchestration:
  //   1. Generate a friendly singer name client-side.
  //   2. Insert a pending ghost row in the store so the sidebar shows
  //      an immediate skeleton.
  //   3. Resolve a base branch (prefer 'main', else first available).
  //   4. Call Tauri create_workspace. taskText defaults to 'none' in
  //      v0.1.0-beta.1 — Step 4 will let the user set a real prompt via the
  //      chat composer.
  //   5. Swap the ghost for the real workspace DTO.
  //   6. On any failure: drop the ghost and rethrow for the caller to
  //      toast.
  async createForPrompt(input: { projectId: string }): Promise<string> {
    const project = this.projects.byId(input.projectId)();
    if (!project) {
      throw new Error(`unknown project ${input.projectId}`);
    }

    const taken = new Set(
      this.store.forProject(input.projectId).map((w) => w.name),
    );
    const name = generateWorkspaceName(taken);

    const pendingId = `pending-${cryptoRandomUUID()}`;
    const pendingRow: Workspace = {
      id: pendingId,
      projectId: input.projectId,
      name,
      branch: '',
      baseBranch: '',
      status: 'backlog',
      pinned: false,
      unread: false,
      pending: true,
      createdAt: new Date(),
    };
    this.store.upsertOne(pendingRow);

    try {
      const branches = await this.adapter.listBranches(project.path);
      const baseBranch = resolveBaseBranch(branches);

      const dto = await this.adapter.create({
        projectId: input.projectId,
        baseBranch,
        taskText: 'none',
        workspaceName: name,
      });

      this.store.removeById(pendingId);
      this.store.upsertOne(workspaceFromDto(dto, input.projectId));
      this.uiState.setActiveWorkspace(dto.workspace_id);
      return dto.workspace_id;
    } catch (err) {
      this.store.removeById(pendingId);
      throw err;
    }
  }

  // Per-workspace install lifecycle state. Read by the chat empty-state
  // step 4 to swap "Setup script completed." for the live install
  // status (running → success/failed). Stored as a signal Map so adding
  // / removing workspaces is one update; reads via installFor(id).
  private readonly _installs = signal<ReadonlyMap<string, WorkspaceInstall>>(
    new Map(),
  );

  installFor(workspaceId: string): WorkspaceInstall {
    return this._installs().get(workspaceId) ?? NO_INSTALL;
  }

  // Detect package manager in the workspace's worktree and run install,
  // tracking lifecycle state in the local signal Map. Replaces the
  // toast-based feedback — the chat Start tab is the single source of
  // truth for install progress now.
  async runInstall(workspaceId: string): Promise<void> {
    this._setInstall(workspaceId, { state: 'running', manager: '' });
    try {
      const result: InstallPackagesResult =
        await this.adapter.installPackages(workspaceId);
      if (!result.ran) {
        this._setInstall(workspaceId, { state: 'no_package', manager: '' });
        return;
      }
      this._setInstall(workspaceId, {
        state: result.success ? 'success' : 'failed',
        manager: result.manager,
      });
    } catch (err) {
      console.warn('[workspaces] install failed', workspaceId, err);
      this._setInstall(workspaceId, { state: 'failed', manager: '' });
    }
  }

  private _setInstall(workspaceId: string, update: WorkspaceInstall): void {
    this._installs.update((m) => {
      const next = new Map(m);
      next.set(workspaceId, update);
      return next;
    });
  }

  // Fetch the real git branches for the project owning `workspaceId`.
  // Returns an empty array if the workspace or its project can't be
  // resolved (the toolbar handles empty gracefully).
  async listBranchesForWorkspace(workspaceId: string): Promise<string[]> {
    const ws = this.workspaceById(workspaceId)();
    if (!ws) return [];
    const project = this.projects.byId(ws.projectId)();
    if (!project) return [];
    return this.adapter.listBranches(project.path);
  }

  // ---- Mutators ------------------------------------------------------

  async archive(id: string): Promise<void> {
    await this.adapter.archive(id);
    this.store.removeById(id);
    if (this.uiState.activeWorkspaceId() === id) {
      this.uiState.setActiveWorkspace(null);
    }
  }

  removeForProject(projectId: string): void {
    this.store.removeForProject(projectId);
  }

  async setStatus(id: string, status: UiWorkspaceStatus): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current) return;
    const previous = current.status;
    this.store.setStatus(id, status);
    try {
      await this.adapter.setUiStatus(id, status);
    } catch (err) {
      this.store.setStatus(id, previous);
      throw err;
    }
  }

  // Plan P0.2.D — lift a frozen workspace back to an editable state.
  // Optimistic flip to the caller-chosen target, then the Tauri
  // `reopen_workspace` call (which also resets the runtime status to
  // `ready`). Reverts on failure so the UI doesn't fall out of sync
  // with the DB.
  async reopen(id: string, target: UiWorkspaceStatus): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current) return;
    const previous = current.status;
    this.store.setStatus(id, target);
    try {
      await this.adapter.reopen(id, target);
    } catch (err) {
      this.store.setStatus(id, previous);
      throw err;
    }
  }

  // Optimistic toggle: flip in-memory immediately, persist via Tauri,
  // revert on failure. The caller toasts whatever error bubbles up.
  async togglePinned(id: string): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current) return;
    const next = !current.pinned;
    this.store.setPinned(id, next);
    try {
      await this.adapter.setPinned(id, next);
    } catch (err) {
      this.store.setPinned(id, current.pinned);
      throw err;
    }
  }

  async toggleUnread(id: string): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current) return;
    const next = !current.unread;
    this.store.setUnread(id, next);
    try {
      await this.adapter.setUnread(id, next);
    } catch (err) {
      this.store.setUnread(id, current.unread);
      throw err;
    }
  }

  /** Clear the workspace's unread flag if set. Fired when the user
   *  views one of its chats; idempotent (no-op when already read). */
  async markRead(id: string): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current || !current.unread) return;
    this.store.setUnread(id, false);
    try {
      await this.adapter.setUnread(id, false);
    } catch (err) {
      this.store.setUnread(id, true);
      throw err;
    }
  }

  // Optimistic rename: patch the store immediately so the new title
  // shows mid-keystroke, persist via Tauri, revert on failure.
  async rename(id: string, name: string): Promise<void> {
    const current = this.workspaceById(id)();
    if (!current) return;
    const previous = current.name;
    if (previous === name) return;
    this.store.setName(id, name);
    try {
      await this.adapter.rename(id, name);
    } catch (err) {
      this.store.setName(id, previous);
      throw err;
    }
  }
}

// Prefer 'main' as base branch; fall back to the first available.
// Refuses an empty list — surfaces as a runtime error the caller toasts.
function resolveBaseBranch(branches: readonly string[]): string {
  if (branches.includes('main')) return 'main';
  if (branches.length > 0) return branches[0];
  throw new Error('project has no branches');
}

// Small wrapper so the facade doesn't reach into a global directly —
// keeps the unit-testable surface intact.
function cryptoRandomUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
