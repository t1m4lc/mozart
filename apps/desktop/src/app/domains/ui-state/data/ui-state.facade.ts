import { Injectable, Signal, computed, inject } from '@angular/core';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_VIEW_STATE,
  UiStateStore,
  type WorkspaceAsideState,
  type WorkspaceFileFlowState,
  type WorkspaceFileOpenOptions,
  type WorkspaceFileViewState,
} from './ui-state.store';

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
  readonly asideStateByWorkspace = this.store.asideStateByWorkspace;

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

  // Returns a Signal that tracks the right-aside state for a given
  // workspace id. Pass a Signal (typically `workspaces.activeId`) so
  // the returned signal reactively flips as the user switches between
  // workspaces. Falls back to DEFAULT_WORKSPACE_ASIDE_STATE while no
  // entry exists for that id (first visit).
  asideStateFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceAsideState> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return DEFAULT_WORKSPACE_ASIDE_STATE;
      return (
        this.store.asideStateByWorkspace()[id] ?? DEFAULT_WORKSPACE_ASIDE_STATE
      );
    });
  }

  updateWorkspaceAsideState(
    workspaceId: string,
    patch: Partial<WorkspaceAsideState>,
  ): void {
    this.store.updateWorkspaceAsideState(workspaceId, patch);
  }

  fileViewStateFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceFileViewState> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return DEFAULT_WORKSPACE_FILE_VIEW_STATE;
      return (
        this.store.fileViewStateByWorkspace()[id] ??
        DEFAULT_WORKSPACE_FILE_VIEW_STATE
      );
    });
  }

  openWorkspaceFile(
    workspaceId: string,
    path: string,
    options: WorkspaceFileOpenOptions,
  ): void {
    this.store.openWorkspaceFile(workspaceId, path, options);
  }

  updateActiveWorkspaceFileViewState(
    workspaceId: string,
    patch: Partial<Pick<WorkspaceFileFlowState, 'mode' | 'splitDiff'>>,
  ): void {
    this.store.updateActiveWorkspaceFileViewState(workspaceId, patch);
  }
}
