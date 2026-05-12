/**
 * `channelToObservable` — bridges a Tauri `Channel<T>` push callback
 * into an RxJS `Observable<T>`.
 *
 * The Tauri `Channel` API is "set a single `.onmessage` handler"; RxJS
 * is the idiomatic Angular shape. This helper allocates the channel,
 * pipes incoming messages into a `Subject`, and exposes a `complete()`
 * hook for callers to signal the natural end of the stream.
 *
 * **Q2 lock (audit-plan.md):** the `complete()` call is driven by the
 * `AgentRunTerminated` tauri-specta event listener — not by a poller.
 * `tauri::ipc::Channel<T>` does not fire any completion signal when
 * the Rust supervisor exits; without `complete()` the subject stays
 * open forever and consumers leak.
 *
 * `complete()` is idempotent: a second call after the subject is
 * closed is a no-op. The race-vulnerable case is "stop button pressed
 * twice" — both code paths can safely call `complete()`.
 */
import { Channel } from '@tauri-apps/api/core';
import { Observable, Subject } from 'rxjs';

export interface ChannelObservable<T> {
  readonly channel: Channel<T>;
  readonly events$: Observable<T>;
  readonly complete: () => void;
  /**
   * Forwards `event` as a regular `next()` on the underlying subject —
   * useful for synthesising error events (e.g. a `StreamEvent::Error`
   * frame) immediately before calling `complete()` so consumers see the
   * payload via the same `events$` observable they're already
   * subscribed to. No-op once the subject is closed.
   */
  readonly emitError: (event: T) => void;
}

export function channelToObservable<T>(): ChannelObservable<T> {
  const subject = new Subject<T>();
  const channel = new Channel<T>();
  channel.onmessage = (msg) => {
    // Subject silently drops `next()` after it's closed, so no guard
    // is needed here — but we keep the closed check anyway to make
    // the no-op explicit for future maintainers.
    if (!subject.closed) subject.next(msg);
  };
  return {
    channel,
    events$: subject.asObservable(),
    complete: () => {
      if (!subject.closed) subject.complete();
    },
    emitError: (event) => {
      if (!subject.closed) subject.next(event);
    },
  };
}
