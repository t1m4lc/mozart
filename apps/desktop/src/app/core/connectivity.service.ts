import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge } from 'rxjs';

import { commands } from './_bindings';

// Reachability is probed from Rust via `probe_anthropic_reachability`.
// Doing it in-browser used to log "Failed to load resource: 404" in
// DevTools — even under `no-cors` the browser still surfaces the wire
// status. reqwest in Tauri doesn't.
const PROBE_INTERVAL_MS = 30_000;

/**
 * Tracks browser online/offline state plus a periodic reachability
 * probe against the Anthropic API. Surfaces:
 *   - `online`: the browser thinks it has a network (navigator.onLine)
 *   - `apiReachable`: last probe round-tripped
 *   - `connected`: both of the above; what UIs gate "non-local LLM
 *     available" on.
 *
 * Singleton via `providedIn: 'root'`. Starts probing immediately and
 * piggy-backs on the browser's online/offline events to force-refresh.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  private readonly _apiReachable = signal<boolean>(true);

  readonly online = this._online.asReadonly();
  readonly apiReachable = this._apiReachable.asReadonly();
  readonly connected = computed(() => this._online() && this._apiReachable());

  constructor() {
    if (typeof window === 'undefined') return;

    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => {
        this._online.set(navigator.onLine);
        // A flap on the system network should re-check the API now,
        // not in 30s.
        void this.probe();
      });

    void this.probe();
    const timer = setInterval(() => {
      void this.probe();
    }, PROBE_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Force a probe now. Returns the new `connected` value. */
  async refresh(): Promise<boolean> {
    await this.probe();
    return this.connected();
  }

  private async probe(): Promise<void> {
    if (!this._online()) {
      this._apiReachable.set(false);
      return;
    }
    try {
      const reachable = await commands.probeAnthropicReachability();
      this._apiReachable.set(reachable);
    } catch {
      this._apiReachable.set(false);
    }
  }
}
