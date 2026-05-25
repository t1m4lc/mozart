import { Injectable, Signal, computed, signal } from '@angular/core';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_PATH_STATE,
  type PersistedFileTab,
  type WorkspaceAsideState,
  type WorkspaceFilePathState,
  type WorkspaceFileViewMap,
} from '@mozart/desktop-ui-state-util';

// All session-only UI state. Survives within an app session, drops on
// app close. Nothing here is persisted to localStorage — durable file
// content lives on disk; dirty edit buffers are flushed there via
// `getCurrentWindow().onCloseRequested` (see app.config.ts). The only
// localStorage-backed key is `mozart-last-url-v1` (RouterFacade).
//
// Three concern groups, one store because they share the "session-only"
// lifecycle and historically lived in two coupled stores split by
// persistence cadence (which no longer applies — see audit doc):
//   - Sidebar: project / status expansion (global to the sidebar)
//   - Per-workspace: open tabs, preview, file view, aside, tree, chat drafts
//   - Last-tab map: per-workspace memory for the resolver fallback
//
// `RouterFacade` provides router-derived signals (active workspace/tab)
// that this store does NOT mirror — the router is the source of truth.

const EMPTY_TABS: readonly PersistedFileTab[] = [];
const EMPTY_VIEW: WorkspaceFileViewMap = {};
const EMPTY_TREE: ReadonlySet<string> = new Set();

@Injectable({ providedIn: 'root' })
export class SessionStore {
  // Sidebar (global) --------------------------------------------------

  private readonly _expandedProjectIds = signal<ReadonlySet<string>>(
    new Set(),
  );
  readonly expandedProjectIds = this._expandedProjectIds.asReadonly();

  private readonly _collapsedStatusIds = signal<ReadonlySet<string>>(
    new Set(),
  );
  readonly collapsedStatusIds = this._collapsedStatusIds.asReadonly();

  toggleProjectExpanded(projectId: string): void {
    this._expandedProjectIds.update((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  expandProjects(projectIds: readonly string[]): void {
    this._expandedProjectIds.update(
      (current) => new Set([...current, ...projectIds]),
    );
  }

  setExpandedProjects(projectIds: readonly string[]): void {
    this._expandedProjectIds.set(new Set(projectIds));
  }

  collapseAllProjects(): void {
    this._expandedProjectIds.set(new Set());
  }

  toggleStatusCollapsed(statusId: string): void {
    this._collapsedStatusIds.update((current) => {
      const next = new Set(current);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      return next;
    });
  }

  setCollapsedStatuses(statusIds: readonly string[]): void {
    this._collapsedStatusIds.set(new Set(statusIds));
  }

  expandAllStatuses(): void {
    this._collapsedStatusIds.set(new Set());
  }

  // Per-workspace ------------------------------------------------------

  private readonly _openFileTabs = signal<
    ReadonlyMap<string, readonly PersistedFileTab[]>
  >(new Map());
  private readonly _preview = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _fileView = signal<
    ReadonlyMap<string, WorkspaceFileViewMap>
  >(new Map());
  private readonly _aside = signal<ReadonlyMap<string, WorkspaceAsideState>>(
    new Map(),
  );
  private readonly _treeExpanded = signal<
    ReadonlyMap<string, ReadonlySet<string>>
  >(new Map());
  private readonly _chatDrafts = signal<
    ReadonlyMap<string, ReadonlyMap<string, string>>
  >(new Map());
  private readonly _lastTab = signal<ReadonlyMap<string, string>>(new Map());
  private readonly _dirtyEdits = signal<
    ReadonlyMap<string, ReadonlyMap<string, DirtyEdit>>
  >(new Map());

  // File tabs ----------------------------------------------------------

  fileTabsFor(workspaceId: string): readonly PersistedFileTab[] {
    return this._openFileTabs().get(workspaceId) ?? EMPTY_TABS;
  }

  readonly openFileTabs = this._openFileTabs.asReadonly();

  setOpenTabs(workspaceId: string, tabs: readonly PersistedFileTab[]): void {
    this._openFileTabs.update((current) => {
      const next = new Map(current);
      if (tabs.length === 0) next.delete(workspaceId);
      else next.set(workspaceId, tabs);
      return next;
    });
  }

  // Preview ------------------------------------------------------------

  previewFor(workspaceId: string): string | null {
    return this._preview().get(workspaceId) ?? null;
  }

  setPreview(workspaceId: string, path: string): void {
    this._preview.update((current) => {
      const next = new Map(current);
      next.set(workspaceId, path);
      return next;
    });
  }

  clearPreview(workspaceId: string): void {
    if (!this._preview().has(workspaceId)) return;
    this._preview.update((current) => {
      const next = new Map(current);
      next.delete(workspaceId);
      return next;
    });
  }

  // Per-path file view -------------------------------------------------

  fileViewStateFor(
    workspaceId: Signal<string | null>,
    path: Signal<string | null>,
  ): Signal<WorkspaceFilePathState> {
    return computed(() => {
      const id = workspaceId();
      const p = path();
      if (!id || !p) return DEFAULT_WORKSPACE_FILE_PATH_STATE;
      return (
        this._fileView().get(id)?.[p] ?? DEFAULT_WORKSPACE_FILE_PATH_STATE
      );
    });
  }

  fileViewMapFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceFileViewMap> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return EMPTY_VIEW;
      return this._fileView().get(id) ?? EMPTY_VIEW;
    });
  }

  upsertFileView(
    workspaceId: string,
    path: string,
    patch: Partial<WorkspaceFilePathState>,
  ): void {
    this._fileView.update((current) => {
      const next = new Map(current);
      const wsMap = next.get(workspaceId) ?? EMPTY_VIEW;
      const currentEntry = wsMap[path] ?? DEFAULT_WORKSPACE_FILE_PATH_STATE;
      next.set(workspaceId, {
        ...wsMap,
        [path]: { ...currentEntry, ...patch },
      });
      return next;
    });
  }

  forgetFileView(workspaceId: string, path: string): void {
    const wsMap = this._fileView().get(workspaceId);
    if (!wsMap || !(path in wsMap)) return;
    this._fileView.update((current) => {
      const next = new Map(current);
      const updated = { ...wsMap };
      delete updated[path];
      if (Object.keys(updated).length === 0) next.delete(workspaceId);
      else next.set(workspaceId, updated);
      return next;
    });
  }

  // Aside --------------------------------------------------------------

  asideStateFor(
    workspaceId: Signal<string | null>,
  ): Signal<WorkspaceAsideState> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return DEFAULT_WORKSPACE_ASIDE_STATE;
      return this._aside().get(id) ?? DEFAULT_WORKSPACE_ASIDE_STATE;
    });
  }

  hasAsideEntry(workspaceId: string): boolean {
    return this._aside().has(workspaceId);
  }

  updateAsideState(
    workspaceId: string,
    patch: Partial<WorkspaceAsideState>,
  ): void {
    this._aside.update((current) => {
      const next = new Map(current);
      const currentEntry = next.get(workspaceId) ?? DEFAULT_WORKSPACE_ASIDE_STATE;
      next.set(workspaceId, { ...currentEntry, ...patch });
      return next;
    });
  }

  // Tree expansion -----------------------------------------------------

  treeExpandedFor(
    workspaceId: Signal<string | null>,
  ): Signal<readonly string[]> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return [];
      const set = this._treeExpanded().get(id) ?? EMPTY_TREE;
      return Array.from(set);
    });
  }

  setTreeExpanded(workspaceId: string, paths: readonly string[]): void {
    this._treeExpanded.update((current) => {
      const next = new Map(current);
      if (paths.length === 0) next.delete(workspaceId);
      else next.set(workspaceId, new Set(paths));
      return next;
    });
  }

  // Chat composer drafts ----------------------------------------------

  /** Session-only chat composer draft for (workspaceId, chatId). Empty
   *  string means "no draft" — caller treats it the same as null. */
  readChatDraft(workspaceId: string, chatId: string): string {
    return this._chatDrafts().get(workspaceId)?.get(chatId) ?? '';
  }

  writeChatDraft(workspaceId: string, chatId: string, content: string): void {
    // Short-circuit no-op writes. The composer's effect fires once on
    // every workspace/chat change to mirror the freshly-loaded draft
    // back into the store — that would re-allocate the inner Map for
    // an unchanged value without this guard.
    const wsMap = this._chatDrafts().get(workspaceId);
    const existing = wsMap?.get(chatId) ?? '';
    if (existing === content) return;
    this._chatDrafts.update((current) => {
      const next = new Map(current);
      const updated = new Map(next.get(workspaceId) ?? []);
      if (content === '') updated.delete(chatId);
      else updated.set(chatId, content);
      if (updated.size === 0) next.delete(workspaceId);
      else next.set(workspaceId, updated);
      return next;
    });
  }

  clearChatDraft(workspaceId: string, chatId: string): void {
    const wsMap = this._chatDrafts().get(workspaceId);
    if (!wsMap || !wsMap.has(chatId)) return;
    this.writeChatDraft(workspaceId, chatId, '');
  }

  // Dirty file-edit buffer (in-memory, flushed to disk on app close) -

  /** Read the live edit buffer for `(workspaceId, path)`. Returns null
   *  if the user hasn't typed anything (or if a successful save cleared
   *  it). The buffer is in-memory only — it does NOT survive a hard
   *  crash; the on-close flush in `app.config.ts` writes dirty buffers
   *  to disk before the window destroys. */
  readEdit(workspaceId: string, path: string): DirtyEdit | null {
    return this._dirtyEdits().get(workspaceId)?.get(path) ?? null;
  }

  writeEdit(
    workspaceId: string,
    path: string,
    content: string,
    baseHash: string,
  ): void {
    this._dirtyEdits.update((current) => {
      const next = new Map(current);
      const wsMap = new Map(next.get(workspaceId) ?? []);
      wsMap.set(path, { content, baseHash });
      next.set(workspaceId, wsMap);
      return next;
    });
  }

  clearEdit(workspaceId: string, path: string): void {
    const wsMap = this._dirtyEdits().get(workspaceId);
    if (!wsMap || !wsMap.has(path)) return;
    this._dirtyEdits.update((current) => {
      const next = new Map(current);
      const updated = new Map(wsMap);
      updated.delete(path);
      if (updated.size === 0) next.delete(workspaceId);
      else next.set(workspaceId, updated);
      return next;
    });
  }

  /** Snapshot of every dirty buffer across all workspaces. Used by the
   *  on-close flush handler to write each buffer back to disk before the
   *  window destroys. */
  allDirtyEdits(): readonly DirtyEditRecord[] {
    const out: DirtyEditRecord[] = [];
    for (const [workspaceId, wsMap] of this._dirtyEdits()) {
      for (const [path, edit] of wsMap) {
        out.push({ workspaceId, path, ...edit });
      }
    }
    return out;
  }

  // Last-active tab per workspace -------------------------------------

  /** Most recent tab id observed for `workspaceId` during this session.
   *  Routed components (`WorkspaceTabContent`) call `setLastTab` from
   *  their input-driven effect — the URL is the source of truth and
   *  `withComponentInputBinding` already surfaces it as inputs, so the
   *  routed component is the natural owner of this signal. */
  lastTabFor(workspaceId: string): string | null {
    return this._lastTab().get(workspaceId) ?? null;
  }

  setLastTab(workspaceId: string, tabId: string): void {
    if (this._lastTab().get(workspaceId) === tabId) return;
    this._lastTab.update((current) => {
      const next = new Map(current);
      next.set(workspaceId, tabId);
      return next;
    });
  }

  // Pruning ------------------------------------------------------------

  pruneWorkspace(workspaceId: string): void {
    this._openFileTabs.update((m) => dropKey(m, workspaceId));
    this._preview.update((m) => dropKey(m, workspaceId));
    this._fileView.update((m) => dropKey(m, workspaceId));
    this._aside.update((m) => dropKey(m, workspaceId));
    this._treeExpanded.update((m) => dropKey(m, workspaceId));
    this._chatDrafts.update((m) => dropKey(m, workspaceId));
    this._lastTab.update((m) => dropKey(m, workspaceId));
    this._dirtyEdits.update((m) => dropKey(m, workspaceId));
  }
}

export interface DirtyEdit {
  readonly content: string;
  readonly baseHash: string;
}

export interface DirtyEditRecord extends DirtyEdit {
  readonly workspaceId: string;
  readonly path: string;
}

function dropKey<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}
