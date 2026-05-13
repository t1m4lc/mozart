import { Injectable, computed, inject } from '@angular/core';
import { ProjectsFacade } from '../../projects';
import { TasksFacade } from '../../tasks';
import { generateWorkspaceName } from '../util-workspace-name';
import type { UiWorkspaceStatus } from './workspace-status';
import { workspaceFromDto } from './workspace.adapter';
import type { Workspace } from './workspace.model';
import { WorkspaceStore } from './workspace.store';
import { WORKSPACES_ADAPTER } from './workspaces.adapter';

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

  readonly all = this.store.workspaces;
  readonly activeId = this.store.activeWorkspaceId;
  readonly pending = this.store.pending;

  byProject(projectId: string) {
    return computed(() => this.store.byProject().get(projectId) ?? []);
  }

  workspaceById(id: string) {
    return computed(
      () => this.store.workspaces().find((w) => w.id === id) ?? null,
    );
  }

  setActive(id: string | null): void {
    this.store.setActive(id);
  }

  // ---- v0.0.1 wiring -------------------------------------------------

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
  }

  // Creates a workspace from a single click on a project's "+ workspace"
  // affordance. The orchestration:
  //   1. Generate a friendly singer name client-side.
  //   2. Insert a pending ghost row in the store so the sidebar shows
  //      an immediate skeleton.
  //   3. Resolve a base branch (prefer 'main', else first available).
  //   4. Call Tauri create_workspace. taskText defaults to 'none' in
  //      v0.0.1 — Step 4 will let the user set a real prompt via the
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
      this.store.setActive(dto.workspace_id);
      return dto.workspace_id;
    } catch (err) {
      this.store.removeById(pendingId);
      throw err;
    }
  }

  // ---- Mutators ------------------------------------------------------

  async archive(id: string): Promise<void> {
    await this.adapter.archive(id);
    this.store.removeById(id);
    if (this.store.activeWorkspaceId() === id) {
      this.store.setActive(null);
    }
  }

  removeForProject(projectId: string): void {
    this.store.removeForProject(projectId);
  }

  setStatus(id: string, status: UiWorkspaceStatus): void {
    this.store.setStatus(id, status);
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

  // Rename stays in-memory in v0.0.1 — no Tauri command for set_name yet.
  // The singer pool ensures uniqueness, and most users won't rename.
  rename(id: string, name: string): void {
    this.store.setName(id, name);
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
