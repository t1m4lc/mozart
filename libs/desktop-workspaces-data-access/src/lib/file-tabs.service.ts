import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  workspaceTabRouteCommands,
  type FileTab,
} from '@mozart/desktop-workspaces-util';
import { ScrollPositionService } from './scroll-position.service';
import { WorkspaceTabRegistry } from './workspace-tab-registry';

// Intent threading: tree single-click opens a preview tab (italic
// title, replaces on next single-click). Anything else (tree
// double-click, Changes-list click, deep link) pins.
export type FileTabIntent = 'preview' | 'pin';

export interface NavigateFileTabOptions {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly path: string;
  readonly intent: FileTabIntent;
  readonly mode: 'edit' | 'diff';
  readonly source: 'all-files' | 'changes';
}

// Per-workspace file tabs in the central shell. Each workspace owns a
// list of open file paths (persisted via `UiStateFacade` →
// `mozart-file-tabs-v1`), an in-memory preview slot (one path per
// workspace, ephemeral — not persisted), and one active path (or null
// = no file active, i.e. the chat panel is showing — driven by the URL).
//
// On bootstrap the service rehydrates open tabs from `UiStateFacade`.
// All restored tabs come back as `isPreview: false` (preview is
// intentionally ephemeral). The route effect in `WorkspaceTabContent`
// mirrors URL → active path; this service mirrors mutations → URL
// (via `navigateToFileTab`).
@Injectable({ providedIn: 'root' })
export class FileTabsService {
  private readonly _openByWorkspace = signal<
    ReadonlyMap<string, readonly string[]>
  >(new Map());
  private readonly _activeByWorkspace = signal<
    ReadonlyMap<string, string | null>
  >(new Map());
  // One preview slot per workspace; the path inside is the currently-
  // previewing tab (if any). In-memory only.
  private readonly _previewByWorkspace = signal<
    ReadonlyMap<string, string>
  >(new Map());
  private readonly scrollPosition = inject(ScrollPositionService);
  private readonly uiState = inject(UiStateFacade);
  private readonly router = inject(Router);
  private readonly tabsRegistry = inject(WorkspaceTabRegistry);

  readonly openByWorkspace = this._openByWorkspace.asReadonly();
  readonly activeByWorkspace = this._activeByWorkspace.asReadonly();

  constructor() {
    // Hydrate from persisted state once. Subsequent mutations write
    // back via `setOpenTabs`.
    const persisted = this.uiState.fileTabsByWorkspace();
    const seed = new Map<string, readonly string[]>();
    for (const [wsId, tabs] of Object.entries(persisted)) {
      if (tabs.length === 0) continue;
      seed.set(wsId, tabs.map((t) => t.path));
    }
    if (seed.size > 0) {
      this._openByWorkspace.set(seed);
    }

    // Mirror in-memory open lists back to UiStateFacade so persistence
    // tracks every mutation without each call site doing it manually.
    effect(() => {
      const map = this._openByWorkspace();
      const seen = new Set<string>();
      for (const [wsId, paths] of map) {
        seen.add(wsId);
        this.uiState.setFileTabs(
          wsId,
          paths.map((path) => ({ path })),
        );
      }
      // Clear persisted entries for workspaces that lost all tabs.
      const persistedNow = this.uiState.fileTabsByWorkspace();
      for (const wsId of Object.keys(persistedNow)) {
        if (!seen.has(wsId)) {
          this.uiState.setFileTabs(wsId, []);
        }
      }
    });
  }

  /** Open paths for `workspaceId`, in insertion order. */
  forWorkspace(workspaceId: string) {
    return computed(
      () => this._openByWorkspace().get(workspaceId) ?? [],
    );
  }

  /** Active file path for `workspaceId`, or null when no file tab is
   *  selected (the chat panel takes over the central content area). */
  activeFor(workspaceId: string) {
    return computed(
      () => this._activeByWorkspace().get(workspaceId) ?? null,
    );
  }

  /** Currently-previewing path for `workspaceId`, or null when no
   *  tab is in preview state. Drives the italic title on the tab. */
  previewFor(workspaceId: string) {
    return computed(
      () => this._previewByWorkspace().get(workspaceId) ?? null,
    );
  }

  /** True when the tab for (`workspaceId`, `path`) is currently in
   *  preview state. Composed into the rendered `FileTab.isPreview`. */
  isPreviewFor(workspaceId: string, path: string): boolean {
    return this._previewByWorkspace().get(workspaceId) === path;
  }

  /** Look up the rendered FileTab shape for (`workspaceId`, `path`).
   *  Used by `feature-file-content` to check preview state without
   *  importing the underlying signal. Returns null when not open. */
  findTab(workspaceId: string, path: string): FileTab | null {
    const list = this._openByWorkspace().get(workspaceId);
    if (!list || !list.includes(path)) return null;
    const tabId = this.tabsRegistry.fileTabId(path);
    if (!tabId) return null;
    return {
      id: tabId,
      kind: 'file',
      title: basename(path),
      filePath: path,
      isPreview: this.isPreviewFor(workspaceId, path),
    };
  }

  /** Open `path` as a preview tab in `workspaceId`. If a different
   *  path already occupies the preview slot, that tab's path is
   *  REPLACED with `path` (one preview per workspace). If `path` is
   *  already open and pinned, this is a no-op apart from activating.
   *  Caller is expected to drive the route navigation; this method
   *  only mutates service state. */
  previewForPath(workspaceId: string, path: string): void {
    const currentPreview = this._previewByWorkspace().get(workspaceId);
    const list = this._openByWorkspace().get(workspaceId) ?? [];

    // Already open as pinned → just activate, leave pinned.
    if (list.includes(path) && currentPreview !== path) {
      this.setActiveFor(workspaceId, path);
      return;
    }

    // Already the active preview → activate (no-op on list).
    if (currentPreview === path) {
      this.setActiveFor(workspaceId, path);
      return;
    }

    // Replace the prior preview slot (if any) with this path.
    this._openByWorkspace.update((current) => {
      const next = new Map(current);
      let nextList = list;
      if (currentPreview && nextList.includes(currentPreview)) {
        // Replace prior preview path in-place to preserve tab position.
        const idx = nextList.indexOf(currentPreview);
        nextList = [
          ...nextList.slice(0, idx),
          path,
          ...nextList.slice(idx + 1),
        ];
        // Forget the displaced preview's scroll position.
        this.scrollPosition.forgetFile(workspaceId, currentPreview);
      } else {
        nextList = [...nextList, path];
      }
      next.set(workspaceId, nextList);
      return next;
    });
    this._previewByWorkspace.update((current) => {
      const next = new Map(current);
      next.set(workspaceId, path);
      return next;
    });
    this.setActiveFor(workspaceId, path);
  }

  /** Pin `path` for `workspaceId`. If not yet open, append + activate.
   *  If open as preview, flip the preview slot (so the tab stops being
   *  italic). If already pinned, activate (idempotent). */
  pinForPath(workspaceId: string, path: string): void {
    const list = this._openByWorkspace().get(workspaceId) ?? [];
    const currentPreview = this._previewByWorkspace().get(workspaceId);

    if (!list.includes(path)) {
      this._openByWorkspace.update((current) => {
        const next = new Map(current);
        next.set(workspaceId, [...list, path]);
        return next;
      });
    }
    if (currentPreview === path) {
      this._previewByWorkspace.update((current) => {
        const next = new Map(current);
        next.delete(workspaceId);
        return next;
      });
    }
    this.setActiveFor(workspaceId, path);
  }

  /** Close the tab for `path` in `workspaceId`. If the closed tab was
   *  active, falls back to the previous file tab (or null = chat).
   *  Also clears the preview slot if it matched, forgets the file's
   *  scroll position, and drops the per-path view + draft entries. */
  closeFor(workspaceId: string, path: string): void {
    const wasActive = this.peekActive(workspaceId) === path;
    let prevNeighbour: string | null = null;
    this._openByWorkspace.update((current) => {
      const next = new Map(current);
      const list = next.get(workspaceId) ?? [];
      const idx = list.indexOf(path);
      if (idx === -1) return current;
      prevNeighbour = list[idx - 1] ?? list[idx + 1] ?? null;
      const filtered = list.filter((p) => p !== path);
      if (filtered.length === 0) next.delete(workspaceId);
      else next.set(workspaceId, filtered);
      return next;
    });
    // Drop preview slot if it pointed at this path.
    if (this._previewByWorkspace().get(workspaceId) === path) {
      this._previewByWorkspace.update((current) => {
        const next = new Map(current);
        next.delete(workspaceId);
        return next;
      });
    }
    this.scrollPosition.forgetFile(workspaceId, path);
    this.uiState.forgetFileView(workspaceId, path);
    this.uiState.clearDraft(workspaceId, path);
    if (wasActive) {
      this.setActiveFor(workspaceId, prevNeighbour);
    }
  }

  /** Make `path` the active tab (null = chat panel). When called with
   *  a path that isn't open yet, this method does NOT open it — use
   *  `previewForPath` / `pinForPath` for that. */
  setActiveFor(workspaceId: string, path: string | null): void {
    this._activeByWorkspace.update((current) => {
      const next = new Map(current);
      if (path === null) next.delete(workspaceId);
      else next.set(workspaceId, path);
      return next;
    });
  }

  /** One-call helper used by both `feature-workspace-files` (tree) and
   *  `feature-changes-list` (Changes pane): builds the tab id,
   *  records the per-path UI state (mode + source + splitDiff
   *  defaulting to false), then navigates with the intent threaded
   *  through `Router` state extras. `WorkspaceTabContent` reads the
   *  intent and dispatches `previewForPath` vs `pinForPath`. */
  async navigateToFileTab(opts: NavigateFileTabOptions): Promise<boolean> {
    const tabId = this.tabsRegistry.fileTabId(opts.path);
    if (!tabId) return false;
    this.uiState.upsertFileView(opts.workspaceId, opts.path, {
      mode: opts.mode,
      source: opts.source,
    });
    return this.router.navigate(
      workspaceTabRouteCommands(opts.projectId, opts.workspaceId, tabId),
      {
        // Pin navigations omit `state` entirely (default = pin in the
        // route effect). Preview navigations also `replaceUrl` so a
        // rapid single→single doesn't pollute history.
        state: opts.intent === 'preview' ? { intent: 'preview' } : undefined,
        replaceUrl: opts.intent === 'preview',
      },
    );
  }

  private peekActive(workspaceId: string): string | null {
    return this._activeByWorkspace().get(workspaceId) ?? null;
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}
