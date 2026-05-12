/**
 * Spec for `channelToObservable` (S1.8b.4).
 *
 * The helper bridges a Tauri `Channel<T>` (single-callback push API) into
 * an RxJS `Observable<T>` so components can compose, filter, take-until,
 * etc. The shape is `{ channel, events$, complete }`:
 *
 *   - `channel` is the live `Channel<T>` instance handed to
 *     `commands.startAgentRun(..., channel)` so the Rust supervisor can
 *     `channel.send` into it from the IPC bridge.
 *   - `events$` is the Observable consumers subscribe to.
 *   - `complete()` is the idempotent done-signal — fired from the
 *     `AgentRunTerminated` event listener in `BindingsService`, NOT from
 *     a poller (Q2 lock).
 *
 * Setup: the Tauri `Channel` constructor calls
 * `window.__TAURI_INTERNALS__.transformCallback`, which the jsdom test
 * env doesn't provide. Stub the internals so `new Channel()` produces
 * a usable instance whose `.onmessage` slot we can poke directly.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';

import { channelToObservable } from './agent-channel.util';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      transformCallback: (cb: (msg: unknown) => void, once?: boolean) => number;
    };
  }
}

beforeEach(() => {
  // Re-stub before each test so order doesn't matter and a single
  // mutation doesn't leak across the suite. The id counter is fine to
  // share within a spec — we never read it.
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 0,
  };
});

describe('channelToObservable', () => {
  it('forwards channel.onmessage callbacks into the events$ observable', async () => {
    const { channel, events$ } = channelToObservable<{ kind: string }>();
    const collected: { kind: string }[] = [];
    const sub = events$.subscribe((v) => collected.push(v));
    // Simulate the Rust side pushing two events.
    channel.onmessage({ kind: 'a' });
    channel.onmessage({ kind: 'b' });
    sub.unsubscribe();
    expect(collected).toEqual([{ kind: 'a' }, { kind: 'b' }]);
  });

  it('complete() terminates the events$ stream so subscribers receive their complete notification', async () => {
    const { events$, complete } = channelToObservable<number>();
    const completedPromise = firstValueFrom(events$.pipe(toArray()));
    // Complete immediately — no values, just the complete signal.
    complete();
    await expect(completedPromise).resolves.toEqual([]);
  });

  it('complete() is idempotent — calling it twice does not throw or re-emit', () => {
    const { complete } = channelToObservable<unknown>();
    // First call closes the inner subject.
    expect(() => complete()).not.toThrow();
    // Second call must be a no-op.
    expect(() => complete()).not.toThrow();
  });

  it('values pushed after complete() are not delivered to subscribers', async () => {
    const { channel, events$, complete } = channelToObservable<number>();
    const collected: number[] = [];
    const sub = events$.subscribe({
      next: (v) => collected.push(v),
    });
    channel.onmessage(1);
    complete();
    // Post-complete, the inner subject is closed; any further onmessage
    // calls are silently dropped (Subject behaviour when closed).
    channel.onmessage(2);
    sub.unsubscribe();
    expect(collected).toEqual([1]);
  });

  it('emitError forwards the event then complete() closes', async () => {
    const { events$, emitError, complete } = channelToObservable<{
      kind: string;
      message?: string;
    }>();
    const collected: { kind: string; message?: string }[] = [];
    let completed = false;
    events$.subscribe({
      next: (v) => collected.push(v),
      complete: () => (completed = true),
    });
    // Synthesise an error frame, then close the stream — mirrors the
    // bindings.service catch-branch shape.
    emitError({ kind: 'error', message: 'boom' });
    complete();
    expect(collected).toEqual([{ kind: 'error', message: 'boom' }]);
    expect(completed).toBe(true);
  });
});
