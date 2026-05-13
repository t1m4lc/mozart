import { Injectable, computed, inject } from '@angular/core';
import type { UiWorkspaceStatus } from './workspace-status';
import { WorkspaceStore } from './workspace.store';

// Public API of the `workspaces` domain. Features inject this — never
// the store directly. The `createForPrompt(...)` flow lands in Step 3
// (worktree.adapter + task store), this facade is currently mock-driven.
@Injectable({ providedIn: 'root' })
export class WorkspacesFacade {
  private readonly store = inject(WorkspaceStore);

  readonly all = this.store.workspaces;
  readonly activeId = this.store.activeWorkspaceId;

  byProject(projectId: string) {
    return computed(() => this.store.byProject().get(projectId) ?? []);
  }

  workspaceById(id: string) {
    return computed(
      () => this.store.workspaces().find((w) => w.id === id) ?? null,
    );
  }

  setActive(id: string): void {
    this.store.setActive(id);
  }
  create(projectId: string): string {
    return this.store.add(projectId);
  }
  archive(id: string): void {
    this.store.archive(id);
  }
  removeForProject(projectId: string): void {
    this.store.removeForProject(projectId);
  }
  setStatus(id: string, status: UiWorkspaceStatus): void {
    this.store.setStatus(id, status);
  }
  toggleUnread(id: string): void {
    this.store.toggleUnread(id);
  }
  togglePinned(id: string): void {
    this.store.togglePinned(id);
  }
  rename(id: string, title: string): void {
    this.store.rename(id, title);
  }
}
