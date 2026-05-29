import { Injectable, Signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  RouterFacade,
  UiStateFacade,
  SessionStore,
} from '@mozart/desktop-ui-state-data-access';
import {
  workspaceTabRouteCommands,
  type FileTab,
} from '@mozart/desktop-workspaces-util';
import { ScrollPositionService } from './scroll-position.service';
import { WorkspaceTabRegistry } from './workspace-tab-registry';

// Intent threading: a single-click reuses the one "preview" file tab
// (italic title) by replacing the active file tab's path in place, so
// single-click never spawns a second tab. Double-click (tree or
// Changes list) and deep links PIN a new tab.
export type FileTabIntent = 'preview' | 'pin';

export interface NavigateFileTabOptions {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly path: string;
  readonly intent: FileTabIntent;
  readonly mode: 'edit' | 'diff';
  readonly source: 'all-files' | 'changes';
}

// Per-workspace file tabs in the central shell. Pure orchestration over
// `SessionStore` (open list + preview slot) and the router
// (active tab is derived from the URL). No persistence — tabs live for
// the session; cold start lands on the URL replayed via RouterFacade.
@Injectable({ providedIn: 'root' })
export class FileTabsService {
  private readonly session = inject(SessionStore);
  private readonly routerFacade = inject(RouterFacade);
  private readonly scrollPosition = inject(ScrollPositionService);
  private readonly uiState = inject(UiStateFacade);
  private readonly router = inject(Router);
  private readonly tabsRegistry = inject(WorkspaceTabRegistry);

  /** Open paths for `workspaceId`, in insertion order. */
  forWorkspace(workspaceId: string): Signal<readonly string[]> {
    return computed(() =>
      this.session.fileTabsFor(workspaceId).map((t) => t.path),
    );
  }

  /** Active file path for `workspaceId`, or null when no file tab is
   *  selected. Derived from the router: only the currently-routed
   *  workspace's file tab (if any) is "active" — other workspaces'
   *  in-session last position lives in `RouterFacade.lastTabFor`. */
  activeFor(workspaceId: string): Signal<string | null> {
    return computed(() => this.activeFilePathNow(workspaceId));
  }

  // Synchronous read of the active file path — shared by `activeFor`'s
  // computed and `previewForPath` (which needs the pre-navigation
  // active tab as its reuse target, read once at click time).
  private activeFilePathNow(workspaceId: string): string | null {
    if (this.routerFacade.activeWorkspaceId() !== workspaceId) return null;
    if (this.routerFacade.activeTabKind() !== 'file') return null;
    const tabId = this.routerFacade.activeTabId();
    if (!tabId) return null;
    const parsed = this.tabsRegistry.parse(tabId);
    return parsed?.kind === 'file' ? parsed.path : null;
  }

  /** Currently-previewing path for `workspaceId`, or null. */
  previewFor(workspaceId: string): Signal<string | null> {
    return computed(() => this.session.previewFor(workspaceId));
  }

  /** True when the tab for (`workspaceId`, `path`) is in preview state. */
  isPreviewFor(workspaceId: string, path: string): boolean {
    return this.session.previewFor(workspaceId) === path;
  }

  /** Open-paths map across all workspaces. Returned for compatibility
   *  with consumers that iterate per-workspace (e.g. chat tab bar). */
  readonly openByWorkspace: Signal<ReadonlyMap<string, readonly string[]>> =
    computed(() => {
      const map = this.session.openFileTabs();
      const result = new Map<string, readonly string[]>();
      for (const [wsId, tabs] of map) {
        result.set(
          wsId,
          tabs.map((t) => t.path),
        );
      }
      return result;
    });

  /** Look up the rendered FileTab shape for (`workspaceId`, `path`).
   *  Used by `feature-file-content` to check preview state. */
  findTab(workspaceId: string, path: string): FileTab | null {
    const tabs = this.session.fileTabsFor(workspaceId);
    if (!tabs.some((t) => t.path === path)) return null;
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

  /** Single-click intent: open `path` in the workspace's one reusable
   *  file tab. Behaviour:
   *   - `path` already open (pinned or preview) → no list change; the
   *     caller's navigation just activates it (idempotent so the route
   *     effect's redundant dispatch is harmless);
   *   - no file tab yet → create one;
   *   - file tab(s) exist → REPLACE the active file tab's path in place
   *     (fallback: the current preview slot, then the last tab, for
   *     single-clicks fired from a non-file tab). One reusable tab —
   *     single-click never spawns a second; `pinForPath` (double-click)
   *     is what opens an additional tab.
   *  Caller drives the route navigation; this only mutates session
   *  state. */
  previewForPath(workspaceId: string, path: string): void {
    const tabs = this.session.fileTabsFor(workspaceId);
    const list = tabs.map((t) => t.path);

    if (list.includes(path)) return;

    if (list.length === 0) {
      this.session.setOpenTabs(workspaceId, [{ path }]);
      this.session.setPreview(workspaceId, path);
      return;
    }

    const active = this.activeFilePathNow(workspaceId);
    const target =
      active && list.includes(active)
        ? active
        : this.session.previewFor(workspaceId) ?? list[list.length - 1];
    const idx = list.indexOf(target);
    const nextList = [...list.slice(0, idx), path, ...list.slice(idx + 1)];
    // Forget the displaced file's scroll position.
    this.scrollPosition.forgetFile(workspaceId, target);
    this.session.setOpenTabs(
      workspaceId,
      nextList.map((p) => ({ path: p })),
    );
    this.session.setPreview(workspaceId, path);
  }

  /** Pin `path` for `workspaceId`. If not yet open, append. If open as
   *  preview, flip the preview slot (so the tab stops being italic).
   *  If already pinned, no-op. */
  pinForPath(workspaceId: string, path: string): void {
    const tabs = this.session.fileTabsFor(workspaceId);
    const list = tabs.map((t) => t.path);
    const currentPreview = this.session.previewFor(workspaceId);

    if (!list.includes(path)) {
      this.session.setOpenTabs(workspaceId, [...tabs, { path }]);
    }
    if (currentPreview === path) {
      this.session.clearPreview(workspaceId);
    }
  }

  /** Close the tab for `path` in `workspaceId`. If the closed tab was
   *  active, returns the previous neighbour (or null = chat) so the
   *  caller can navigate. Also clears the preview slot if it matched,
   *  forgets the file's scroll position, and drops the per-path view
   *  + draft entries. */
  closeFor(workspaceId: string, path: string): string | null {
    const tabs = this.session.fileTabsFor(workspaceId);
    const list = tabs.map((t) => t.path);
    const idx = list.indexOf(path);
    if (idx === -1) return null;

    const prevNeighbour = list[idx - 1] ?? list[idx + 1] ?? null;
    const next = tabs.filter((t) => t.path !== path);
    this.session.setOpenTabs(workspaceId, next);

    if (this.session.previewFor(workspaceId) === path) {
      this.session.clearPreview(workspaceId);
    }
    this.scrollPosition.forgetFile(workspaceId, path);
    this.uiState.forgetFileView(workspaceId, path);
    this.uiState.clearEdit(workspaceId, path);
    return prevNeighbour;
  }

  /** One-call helper used by both `feature-workspace-files` (tree) and
   *  `feature-changes-list` (Changes pane): records the per-path UI
   *  state (mode + source defaulting to false splitDiff), eagerly
   *  applies the preview/pin mutation, then navigates with the intent
   *  threaded through `Router` state extras for any consumer that
   *  reads the URL (deep links, back/forward).
   *
   *  Why both? Angular's Router defaults to
   *  `onSameUrlNavigation: 'ignore'` — a second single-click on the
   *  already-active file, or a double-click on a tab that's already
   *  open as preview, never re-fires `NavigationEnd`. The route effect
   *  in `WorkspaceTabContent` therefore can't promote preview → pin
   *  in those cases. Running the mutation here makes the click handler
   *  the source of truth and keeps the route effect as the fallback
   *  for navigations that actually change the URL. */
  async navigateToFileTab(opts: NavigateFileTabOptions): Promise<boolean> {
    const tabId = this.tabsRegistry.fileTabId(opts.path);
    if (!tabId) return false;
    this.uiState.upsertFileView(opts.workspaceId, opts.path, {
      mode: opts.mode,
      source: opts.source,
    });
    // Apply tab-list mutation BEFORE router.navigate so re-clicks on
    // the same URL still promote preview→pinned or activate an existing
    // tab. Both methods are idempotent (no-op on already-matching state)
    // so the route effect's redundant dispatch is harmless.
    if (opts.intent === 'preview') {
      this.previewForPath(opts.workspaceId, opts.path);
    } else {
      this.pinForPath(opts.workspaceId, opts.path);
    }
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
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}
