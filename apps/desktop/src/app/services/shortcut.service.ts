/**
 * RxJS-backed keyboard shortcut registry.
 *
 * Public API:
 *   - `register$(input)` → `Observable<ShortcutEventOutput>` (subscribe yourself,
 *     ideally with `takeUntilDestroyed()`).
 *   - `register(input)` → `() => void` (imperative dispose handle).
 *
 * Implementation notes:
 * - A single `fromEvent(document, 'keydown')` upstream is shared via
 *   `share()` so the listener only attaches once for all consumers.
 * - When `input.target` is provided, the stream switches to that
 *   element's own keydown events (capturing-by-default `bubbles: true`
 *   suffices for jsdom-style synthetic dispatch).
 * - The platform is resolved at construction time from
 *   `document.defaultView`; we don't re-resolve per event.
 */
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, fromEvent } from 'rxjs';
import { filter, share, takeUntil, throttleTime } from 'rxjs/operators';

import {
  matchesEvent,
  normalizeKey,
  resolvePlatform,
} from '../shared/keyboard/key-combo';
import {
  AllowIn,
  type KeyCombo,
  type Platform,
  type Shortcut,
  type ShortcutEventOutput,
  type ShortcutInput,
} from '../shared/keyboard/shortcut.types';

@Injectable({ providedIn: 'root' })
export class ShortcutService {
  private readonly doc = inject(DOCUMENT);
  private readonly platform: Platform = resolvePlatform(this.doc.defaultView);
  private readonly documentKeydown$ = fromEvent<KeyboardEvent>(
    this.doc,
    'keydown',
  ).pipe(share());

  /**
   * Subscribe to a shortcut. The returned Observable emits each match.
   * Callers are responsible for unsubscribing (e.g. via
   * `takeUntilDestroyed()` in a component).
   */
  register$(input: ShortcutInput): Observable<ShortcutEventOutput> {
    const combos = this.collectCombos(input.key);
    const allowIn = new Set<AllowIn>(input.allowIn ?? []);
    const source$ = input.target
      ? fromEvent<KeyboardEvent>(input.target, 'keydown')
      : this.documentKeydown$;
    const throttle = input.throttleTime ?? 0;

    let stream$ = source$.pipe(
      filter((event) => !this.isBlockedByFocus(event, allowIn)),
      filter((event) =>
        input.key === 'all'
          ? true
          : combos.some((c) => matchesEvent(c, event, this.platform)),
      ),
    );

    if (throttle > 0) {
      stream$ = stream$.pipe(
        throttleTime(throttle, undefined, { leading: true, trailing: false }),
      );
    }

    return new Observable<ShortcutEventOutput>((subscriber) => {
      const sub = stream$.subscribe((event) => {
        if (input.preventDefault) event.preventDefault();
        subscriber.next({ event, key: input.key });
      });
      return () => sub.unsubscribe();
    });
  }

  /**
   * Imperative variant: subscribes immediately, returns a dispose
   * callback. Useful in spec helpers, settings dialogs, etc.
   */
  register(input: ShortcutInput): () => void {
    const stop$ = new Subject<void>();
    this.register$(input)
      .pipe(takeUntil(stop$))
      .subscribe((out) => input.command(out));
    return () => {
      stop$.next();
      stop$.complete();
    };
  }

  /** Normalize the `Shortcut.key` field into an array of `KeyCombo`. */
  private collectCombos(key: Shortcut['key']): readonly KeyCombo[] {
    if (key === 'all') return [];
    if (Array.isArray(key)) return key.map((k) => normalizeKey(k));
    return [normalizeKey(key as string)];
  }

  /**
   * Returns `true` when focus is inside an editable element whose
   * tagName is NOT in `allowIn` — blocking the shortcut so the user
   * can keep typing.
   */
  private isBlockedByFocus(
    event: KeyboardEvent,
    allowIn: Set<AllowIn>,
  ): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName as AllowIn;
    if (
      tag === AllowIn.Textarea ||
      tag === AllowIn.Input ||
      tag === AllowIn.Select
    ) {
      return !allowIn.has(tag);
    }
    return false;
  }
}
