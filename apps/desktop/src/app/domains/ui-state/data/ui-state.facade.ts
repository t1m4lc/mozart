import { Injectable, inject } from '@angular/core';
import { UiStateStore } from './ui-state.store';

// Public surface for ui-state. The two existing domain facades
// (WorkspacesFacade, ProjectsFacade) delegate to this store so that
// consumers continue reading their familiar APIs while the ID + sidebar
// expand state become observable in Redux DevTools through a single
// "uiState" tree.
@Injectable({ providedIn: 'root' })
export class UiStateFacade {
  private readonly store = inject(UiStateStore);

  readonly activeWorkspaceId = this.store.activeWorkspaceId;
  readonly expandedProjectIds = this.store.expandedProjectIds;
  readonly collapsedStatusIds = this.store.collapsedStatusIds;

  setActiveWorkspace(id: string | null): void {
    this.store.setActiveWorkspace(id);
  }

  toggleProjectExpanded(projectId: string): void {
    this.store.toggleProjectExpanded(projectId);
  }

  isProjectExpanded(projectId: string): boolean {
    return this.store.expandedProjectIds().has(projectId);
  }

  expandProjects(projectIds: readonly string[]): void {
    this.store.expandProjects(projectIds);
  }

  setExpandedProjects(projectIds: readonly string[]): void {
    this.store.setExpandedProjects(projectIds);
  }

  collapseAllProjects(): void {
    this.store.collapseAllProjects();
  }

  isStatusCollapsed(statusId: string): boolean {
    return this.store.collapsedStatusIds().has(statusId);
  }

  toggleStatusCollapsed(statusId: string): void {
    this.store.toggleStatusCollapsed(statusId);
  }

  setCollapsedStatuses(statusIds: readonly string[]): void {
    this.store.setCollapsedStatuses(statusIds);
  }

  expandAllStatuses(): void {
    this.store.expandAllStatuses();
  }
}
