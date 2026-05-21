import { Injectable, computed, signal, type Signal } from '@angular/core';

// Per-tab scroll position + per-chat attach/detach mode.
// Session-scoped (in-memory; a relaunch resets everything). Matches
// FileTabsService's lifetime. Tab keys are namespaced so the same
// string (e.g. a file path) can't collide with a chat id.
//
// Attach/detach drives the chat auto-follow behavior:
//   - attached: streaming agent responses pin to the bottom
//   - detached: the user scrolled up; the stream does NOT pull the view down
//   - Send-a-prompt always flips back to attached.
//
// The service has no DOM access — callers (FeatureWorkspaceMiddle for
// chat; [mzScrollPersist] for file surfaces) read scrollTop off the
// right element and hand it in via `remember`.

export type FollowMode = 'attached' | 'detached';

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
  private readonly _followModeByChat = signal<ReadonlyMap<string, FollowMode>>(
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
    // Workspace-level forget also clears any per-chat follow mode for
    // chats that lived in this workspace. The service doesn't know the
    // chat ids, so callers responsible for chat lifecycle should also
    // invoke forgetChat() per id when they delete chats.
  }

  /** Drop every key tied to a chat — both its scrollTop and follow mode. */
  forgetChat(workspaceId: string, chatId: string): void {
    this.forget(chatTabKey(workspaceId, chatId));
    this._followModeByChat.update((current) => {
      if (!current.has(chatId)) return current;
      const next = new Map(current);
      next.delete(chatId);
      return next;
    });
  }

  /** Drop the file tab's scrollTop. Call when the tab closes. */
  forgetFile(workspaceId: string, path: string): void {
    this.forget(fileTabKey(workspaceId, path));
  }

  /** Flip a chat to attached — auto-follow agent responses. Called on
   *  prompt send and when the user clicks the scroll-to-bottom button. */
  setAttached(chatId: string): void {
    this.setFollowMode(chatId, 'attached');
  }

  /** Flip a chat to detached — stream tokens don't pull the view down.
   *  Called when the user scrolls up past the at-bottom threshold. */
  setDetached(chatId: string): void {
    this.setFollowMode(chatId, 'detached');
  }

  /** Synchronous follow-mode read. Default 'attached' for an unknown
   *  chat — a never-visited chat starts in auto-follow. */
  followMode(chatId: string): FollowMode {
    return this._followModeByChat().get(chatId) ?? 'attached';
  }

  /** Reactive follow-mode for `computed`/`effect`. Returns the same
   *  signal each call for a given chatId so effects don't re-subscribe. */
  followModeFor(chatId: string): Signal<FollowMode> {
    let cached = this._followModeSignalCache.get(chatId);
    if (!cached) {
      cached = computed(() => this._followModeByChat().get(chatId) ?? 'attached');
      this._followModeSignalCache.set(chatId, cached);
    }
    return cached;
  }

  /** True when the chat is in attach mode (synchronous read). */
  isAttached(chatId: string): boolean {
    return this.followMode(chatId) === 'attached';
  }

  private readonly _followModeSignalCache = new Map<string, Signal<FollowMode>>();

  private setFollowMode(chatId: string, mode: FollowMode): void {
    this._followModeByChat.update((current) => {
      if (current.get(chatId) === mode) return current;
      const next = new Map(current);
      next.set(chatId, mode);
      return next;
    });
  }
}
