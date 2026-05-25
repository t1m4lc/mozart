import { Injectable, type Signal, computed, signal } from '@angular/core';

// Shared contract for any scrollable surface that opts into the
// registry. The directive form (`MzScrollSurface`) and the programmatic
// form (returned by `attachToElement`) both implement this.
//
// Persistence + IO sentinel + scrollIntoView/scrollToBottom live on the
// implementation, not here — the registry only carries handles.
export interface ScrollSurface {
  readonly isAtBottom: Signal<boolean>;
  readonly element: Signal<HTMLElement | null>;
  setKey(key: string | null): void;
  scrollToBottom(smooth?: boolean): void;
  scrollIntoView(target: HTMLElement, opts?: ScrollIntoViewOptions): void;
  scrollTo(top: number, smooth?: boolean): void;
  snapshot(): void;
  detach(): void;
}

/**
 * Thin Map-backed seam so siblings that don't own a surface's DOM (the
 * always-mounted composer being the canonical case) can call
 * `scrollToBottom` / `scrollIntoView` on a chat surface mounted in a
 * different `@switch` branch.
 *
 * Replaces `ChatScrollOrchestrator`. The orchestrator's `register` /
 * `unregister` / `scrollToBottom` semantics survive; the
 * grace-window, focus-request channel, and DOM-coupling are gone.
 * Scope §6.1: chat-only registers. File diff and file edit do NOT
 * register because no sibling needs to address them.
 *
 * Entries are signal-backed (one writable signal per id) so consumers
 * that read reactively see the surface flip from old → new on a
 * `@switch` destroy/recreate without an intervening `null` flicker
 * within the same change-detection turn.
 */
@Injectable({ providedIn: 'root' })
export class ScrollSurfaceRegistry {
  private readonly _entries = new Map<
    string,
    ReturnType<typeof signal<ScrollSurface | null>>
  >();

  /** Register a surface under an id. Replaces any prior entry. */
  register(id: string, surface: ScrollSurface): void {
    const existing = this._entries.get(id);
    if (existing) {
      existing.set(surface);
      return;
    }
    this._entries.set(id, signal<ScrollSurface | null>(surface));
  }

  /** Unregister a surface for an id. Idempotent. Leaves the inner
   *  signal in place (set to null) so subscribers can re-attach when
   *  the same id re-registers without losing reactivity. When
   *  `surface` is provided, only nulls the entry if it still matches —
   *  prevents an old-instance teardown from nulling a newer surface
   *  that registered first (race on rapid @switch destroy/recreate). */
  unregister(id: string, surface?: ScrollSurface): void {
    const existing = this._entries.get(id);
    if (!existing) return;
    if (surface && existing() !== surface) return;
    existing.set(null);
  }

  /** Synchronous read of the current surface for an id. Returns null
   *  when nothing is registered. Use this for one-shot imperative
   *  calls (`registry.get(ws)?.scrollToBottom(true)`). */
  get(id: string): ScrollSurface | null {
    return this._entries.get(id)?.() ?? null;
  }

  /** Reactive entry. Returns the same signal across calls for a given
   *  id so `computed`s/`effect`s don't churn subscriptions. The signal
   *  is initialized to null when first read so consumers don't have to
   *  special-case "no entry yet". */
  entry(id: string): Signal<ScrollSurface | null> {
    let s = this._entries.get(id);
    if (!s) {
      s = signal<ScrollSurface | null>(null);
      this._entries.set(id, s);
    }
    return s.asReadonly();
  }

  /** Reactive boolean — is the surface for `id` currently at-bottom?
   *  Defaults to `true` when no surface is registered (matches the
   *  "fresh chat, attached" default). Useful for composer UI like the
   *  scroll-to-bottom button. Cached by id so a `computed` that reads
   *  this doesn't allocate a new inner computed every render. */
  isAtBottom(id: string): Signal<boolean> {
    let s = this._isAtBottomCache.get(id);
    if (!s) {
      s = computed(() => this.entry(id)()?.isAtBottom() ?? true);
      this._isAtBottomCache.set(id, s);
    }
    return s;
  }

  private readonly _isAtBottomCache = new Map<string, Signal<boolean>>();
}
