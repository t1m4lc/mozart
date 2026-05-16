import { Injectable, computed, signal } from '@angular/core';

// Per-workspace file tabs in the central shell. Each workspace owns a
// list of open file paths and one active path (or null = no file
// active, i.e. the chat panel is showing). State is session-scoped —
// the service is `providedIn: 'root'` so file tabs survive route
// changes, but a restart resets them.
//
// Opened by the Files slot "Changes" tab (clicking a file path adds
// it as a tab in the workspace's central tab bar and activates it).
// The workspace-detail page reads the active path : when non-null it
// renders the diff view ; when null it falls through to the chat panel.
@Injectable({ providedIn: 'root' })
export class FileTabsService {
  private readonly _openByWorkspace = signal<
    ReadonlyMap<string, readonly string[]>
  >(new Map());
  private readonly _activeByWorkspace = signal<
    ReadonlyMap<string, string | null>
  >(new Map());

  readonly openByWorkspace = this._openByWorkspace.asReadonly();
  readonly activeByWorkspace = this._activeByWorkspace.asReadonly();

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

  /** Open `path` as a tab in `workspaceId`'s central tab bar and make
   *  it active. Idempotent — if the path is already open, just
   *  activates it. */
  openFor(workspaceId: string, path: string): void {
    this._openByWorkspace.update((current) => {
      const next = new Map(current);
      const list = next.get(workspaceId) ?? [];
      if (!list.includes(path)) {
        next.set(workspaceId, [...list, path]);
      }
      return next;
    });
    this.setActiveFor(workspaceId, path);
  }

  /** Close the tab for `path` in `workspaceId`. If the closed tab was
   *  active, falls back to the previous file tab (or null = chat). */
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
    if (wasActive) {
      this.setActiveFor(workspaceId, prevNeighbour);
    }
  }

  /** Make `path` the active tab (null = chat panel). When called with
   *  a path that isn't open yet, this method does NOT open it — use
   *  `openFor` for that. */
  setActiveFor(workspaceId: string, path: string | null): void {
    this._activeByWorkspace.update((current) => {
      const next = new Map(current);
      if (path === null) next.delete(workspaceId);
      else next.set(workspaceId, path);
      return next;
    });
  }

  private peekActive(workspaceId: string): string | null {
    return this._activeByWorkspace().get(workspaceId) ?? null;
  }
}
