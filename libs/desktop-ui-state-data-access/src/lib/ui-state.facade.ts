import { Injectable, Signal, inject } from '@angular/core';
import {
  type PersistedFileTab,
  type WorkspaceAsideState,
  type WorkspaceFilePathState,
  type WorkspaceFileViewMap,
} from '@mozart/desktop-ui-state-util';
import { RouterFacade } from './router.facade';
import { type DirtyEdit, SessionStore } from './session.store';

// Compat seam over two backing stores:
//   - SessionStore     — all session-only UI state (sidebar + per-workspace
//                        incl. live edit buffer flushed to disk on close)
//   - RouterFacade     — router-derived active position + durable last URL
//
// Consumers continue to import this single facade. The split between
// backing stores stays an implementation detail.
@Injectable({ providedIn: 'root' })
export class UiStateFacade {
  private readonly session = inject(SessionStore);
  private readonly routerFacade = inject(RouterFacade);

  // Active workspace is derived from the router URL — no setter.
  readonly activeWorkspaceId = this.routerFacade.activeWorkspaceId;

  // Sidebar -----------------------------------------------------------

  readonly expandedProjectIds = this.session.expandedProjectIds;
  readonly collapsedStatusIds = this.session.collapsedStatusIds;

  toggleProjectExpanded(projectId: string): void {
    this.session.toggleProjectExpanded(projectId);
  }

  isProjectExpanded(projectId: string): boolean {
    return this.session.expandedProjectIds().has(projectId);
  }

  expandProjects(projectIds: readonly string[]): void {
    this.session.expandProjects(projectIds);
  }

  setExpandedProjects(projectIds: readonly string[]): void {
    this.session.setExpandedProjects(projectIds);
  }

  collapseAllProjects(): void {
    this.session.collapseAllProjects();
  }

  isStatusCollapsed(statusId: string): boolean {
    return this.session.collapsedStatusIds().has(statusId);
  }

  toggleStatusCollapsed(statusId: string): void {
    this.session.toggleStatusCollapsed(statusId);
  }

  setCollapsedStatuses(statusIds: readonly string[]): void {
    this.session.setCollapsedStatuses(statusIds);
  }

  expandAllStatuses(): void {
    this.session.expandAllStatuses();
  }

  // Right-aside (session) ---------------------------------------------

  asideStateFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceAsideState> {
    return this.session.asideStateFor(workspaceId);
  }

  updateWorkspaceAsideState(
    workspaceId: string,
    patch: Partial<WorkspaceAsideState>,
  ): void {
    this.session.updateAsideState(workspaceId, patch);
  }

  hasAsideEntry(workspaceId: string): boolean {
    return this.session.hasAsideEntry(workspaceId);
  }

  // Per-path file view (session) --------------------------------------

  fileViewStateFor(
    workspaceId: Signal<string | null>,
    path: Signal<string | null>,
  ): Signal<WorkspaceFilePathState> {
    return this.session.fileViewStateFor(workspaceId, path);
  }

  fileViewMapFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceFileViewMap> {
    return this.session.fileViewMapFor(workspaceId);
  }

  upsertFileView(
    workspaceId: string,
    path: string,
    patch: Partial<WorkspaceFilePathState>,
  ): void {
    this.session.upsertFileView(workspaceId, path, patch);
  }

  forgetFileView(workspaceId: string, path: string): void {
    this.session.forgetFileView(workspaceId, path);
  }

  // Open file tabs (session) ------------------------------------------

  fileTabsFor(workspaceId: string): readonly PersistedFileTab[] {
    return this.session.fileTabsFor(workspaceId);
  }

  readonly fileTabsByWorkspace = this.session.openFileTabs;

  setFileTabs(workspaceId: string, tabs: readonly PersistedFileTab[]): void {
    this.session.setOpenTabs(workspaceId, tabs);
  }

  // Last-active tab (session) -----------------------------------------

  lastActiveTabIdFor(workspaceId: string): string | null {
    return this.session.lastTabFor(workspaceId);
  }

  setLastActiveTab(workspaceId: string, tabId: string): void {
    this.session.setLastTab(workspaceId, tabId);
  }

  // Live edit buffer (in-memory, flushed to disk on app close) -------

  readEdit(workspaceId: string, path: string): DirtyEdit | null {
    return this.session.readEdit(workspaceId, path);
  }

  writeEdit(
    workspaceId: string,
    path: string,
    content: string,
    baseHash: string,
  ): void {
    this.session.writeEdit(workspaceId, path, content, baseHash);
  }

  clearEdit(workspaceId: string, path: string): void {
    this.session.clearEdit(workspaceId, path);
  }

  // Chat composer drafts (session) ------------------------------------

  readChatDraft(workspaceId: string, chatId: string): string {
    return this.session.readChatDraft(workspaceId, chatId);
  }

  writeChatDraft(workspaceId: string, chatId: string, content: string): void {
    this.session.writeChatDraft(workspaceId, chatId, content);
  }

  clearChatDraft(workspaceId: string, chatId: string): void {
    this.session.clearChatDraft(workspaceId, chatId);
  }

  // File tree expansion (session) -------------------------------------

  treeExpandedFor(
    workspaceId: Signal<string | null>,
  ): Signal<readonly string[]> {
    return this.session.treeExpandedFor(workspaceId);
  }

  setTreeExpanded(workspaceId: string, paths: readonly string[]): void {
    this.session.setTreeExpanded(workspaceId, paths);
  }

  // Workspace prune (cross-store fan-out) -----------------------------

  pruneWorkspace(workspaceId: string): void {
    this.session.pruneWorkspace(workspaceId);
  }
}
