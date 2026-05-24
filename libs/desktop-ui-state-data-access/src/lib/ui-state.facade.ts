import { Injectable, Signal, computed, inject } from '@angular/core';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_PATH_STATE,
  type DraftEntry,
  type PersistedFileTab,
  type WorkspaceAsideState,
  type WorkspaceFilePathState,
  type WorkspaceFileViewMap,
} from '@mozart/desktop-ui-state-util';
import { DraftsStore } from './drafts.store';
import { FileTabsStore } from './file-tabs.store';
import { UiStateStore } from './ui-state.store';

const EMPTY_TABS: readonly PersistedFileTab[] = [];

// Public surface for ui-state across all three underlying stores —
// UiStateStore (aside / projects / tree), FileTabsStore (open tabs /
// last-active / per-path mode), and DraftsStore (unsaved edits via
// worker). Consumers get a single facade so the split between stores
// stays an implementation detail.
@Injectable({ providedIn: 'root' })
export class UiStateFacade {
  private readonly store = inject(UiStateStore);
  private readonly fileTabsStore = inject(FileTabsStore);
  private readonly draftsStore = inject(DraftsStore);

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

  /** Per-(workspace, path) file view state for the active file in
   *  `feature-file-content`. Reactively flips as the user navigates
   *  between file tabs (each path remembers its own mode + splitDiff). */
  fileViewStateFor(
    workspaceId: Signal<string | null>,
    path: Signal<string | null>,
  ): Signal<WorkspaceFilePathState> {
    return computed(() => {
      const id = workspaceId();
      const p = path();
      if (!id || !p) return DEFAULT_WORKSPACE_FILE_PATH_STATE;
      return (
        this.fileTabsStore.fileViewByWorkspace()[id]?.[p] ??
        DEFAULT_WORKSPACE_FILE_PATH_STATE
      );
    });
  }

  /** Whole per-workspace view map — used by surfaces that need to
   *  inspect every open path's state (rare; mostly for tests). */
  fileViewMapFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceFileViewMap> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return {};
      return this.fileTabsStore.fileViewByWorkspace()[id] ?? {};
    });
  }

  upsertFileView(
    workspaceId: string,
    path: string,
    patch: Partial<WorkspaceFilePathState>,
  ): void {
    this.fileTabsStore.upsertFileView(workspaceId, path, patch);
  }

  forgetFileView(workspaceId: string, path: string): void {
    this.fileTabsStore.forgetFileView(workspaceId, path);
  }

  /** Persisted file-tab list for a workspace. Used by FileTabsService
   *  on bootstrap to restore the open tabs strip. */
  fileTabsFor(workspaceId: string): readonly PersistedFileTab[] {
    return this.fileTabsStore.fileTabsByWorkspace()[workspaceId] ?? EMPTY_TABS;
  }

  /** Returns a Signal of all persisted file-tab maps. Cheap to consume
   *  in components that filter by workspace inline. */
  readonly fileTabsByWorkspace = this.fileTabsStore.fileTabsByWorkspace;

  setFileTabs(workspaceId: string, tabs: readonly PersistedFileTab[]): void {
    this.fileTabsStore.setOpenTabs(workspaceId, tabs);
  }

  /** Persisted last-active tab id for `workspaceId`. Resolver reads
   *  this on workspace navigation; null means fall back to default chat. */
  lastActiveTabIdFor(workspaceId: string): string | null {
    return (
      this.fileTabsStore.lastActiveTabIdByWorkspace()[workspaceId] ?? null
    );
  }

  setLastActiveTab(workspaceId: string, tabId: string | null): void {
    this.fileTabsStore.setLastActiveTab(workspaceId, tabId);
  }

  // Drafts — synchronous reads from the in-memory mirror, async writes
  // through the worker (transparent to callers).
  readDraft(workspaceId: string, path: string): DraftEntry | null {
    return this.draftsStore.read(workspaceId, path);
  }

  writeDraft(workspaceId: string, path: string, content: string): void {
    this.draftsStore.set(workspaceId, path, content);
  }

  clearDraft(workspaceId: string, path: string): void {
    this.draftsStore.clear(workspaceId, path);
  }

  /** Persisted expanded-folder list for a workspace's All-files tree.
   *  Pass a Signal (typically the file-tree's `workspaceId` input)
   *  so the returned signal flips reactively on workspace switch and
   *  the tree restores the user's previous expansion state. */
  treeExpandedFor(
    workspaceId: Signal<string | null>,
  ): Signal<readonly string[]> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return [];
      return this.store.treeExpandedByWorkspace()[id] ?? [];
    });
  }

  setTreeExpanded(workspaceId: string, paths: readonly string[]): void {
    this.store.setTreeExpanded(workspaceId, paths);
  }

  // Drop every per-workspace entry across all three stores. Called by
  // WorkspacesFacade on archive / project removal so the persisted
  // maps stay bounded.
  pruneWorkspace(workspaceId: string): void {
    this.store.pruneWorkspace(workspaceId);
    this.fileTabsStore.pruneWorkspace(workspaceId);
    this.draftsStore.pruneWorkspace(workspaceId);
  }
}
