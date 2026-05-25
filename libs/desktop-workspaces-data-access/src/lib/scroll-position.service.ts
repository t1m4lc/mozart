import { Injectable, signal } from '@angular/core';

// Per-tab scroll position storage. Session-scoped (in-memory; a relaunch
// resets everything). Matches FileTabsService's lifetime. Tab keys are
// namespaced so the same string (e.g. a file path) can't collide with a
// chat id.
//
// The service has no DOM access — callers ([mzScrollSurface] directive
// for all surfaces; programmatic attach form for CodeMirror's scrollDOM)
// read scrollTop off the right element and hand it in via `remember`.
//
// Attach/detach state (formerly here) is now derived geometrically by
// MzScrollSurface's IntersectionObserver and exposed via the directive's
// `isAtBottom` signal + ScrollSurfaceRegistry. The previous
// _followModeByChat map + signal cache are gone.

/** Key for a chat tab's scroll position. */
export function chatTabKey(workspaceId: string, chatId: string): string {
  return `chat:${workspaceId}:${chatId}`;
}

/** Key for a file tab's scroll position. */
export function fileTabKey(workspaceId: string, path: string): string {
  return `file:${workspaceId}:${path}`;
}

@Injectable({ providedIn: 'root' })
export class ScrollPositionService {
  // Map clones on every mutation so signal equality flips. Bounded by
  // the number of distinct tabs touched in a session — at typical sizes
  // (< 100 entries) the copy cost is sub-millisecond.
  private readonly _scrollByTabKey = signal<ReadonlyMap<string, number>>(
    new Map(),
  );

  /** Store the current scrollTop for a tab. Overwrites any prior value. */
  remember(key: string, scrollTop: number): void {
    this._scrollByTabKey.update((current) => {
      const next = new Map(current);
      next.set(key, scrollTop);
      return next;
    });
  }

  /** Read the stored scrollTop for a tab, or null when unknown. */
  recall(key: string): number | null {
    return this._scrollByTabKey().get(key) ?? null;
  }

  /** Drop the stored value for a tab. Idempotent. */
  forget(key: string): void {
    this._scrollByTabKey.update((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }

  /** Drop every key tied to a workspace. Call from facades on workspace
   *  delete so the in-memory map doesn't grow unbounded. */
  forgetWorkspace(workspaceId: string): void {
    const chatPrefix = `chat:${workspaceId}:`;
    const filePrefix = `file:${workspaceId}:`;
    this._scrollByTabKey.update((current) => {
      let mutated = false;
      const next = new Map(current);
      for (const key of next.keys()) {
        if (key.startsWith(chatPrefix) || key.startsWith(filePrefix)) {
          next.delete(key);
          mutated = true;
        }
      }
      return mutated ? next : current;
    });
  }

  /** Drop the file tab's scrollTop. Call when the tab closes. */
  forgetFile(workspaceId: string, path: string): void {
    this.forget(fileTabKey(workspaceId, path));
  }
}
