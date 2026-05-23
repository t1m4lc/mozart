import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge } from 'rxjs';
import { ConnectivityService } from '@mozart/desktop-core-data-access';

import { commands } from './_bindings';

// Reachability is probed from Rust via `probe_anthropic_reachability`.
// Doing it in-browser used to log "Failed to load resource: 404" in
// DevTools — even under `no-cors` the browser still surfaces the wire
// status. reqwest in Tauri doesn't.
const PROBE_INTERVAL_MS = 30_000;

/**
 * Tauri-bound impl of the abstract `ConnectivityService` declared in
 * `desktop-core-data-access`. Tracks browser online/offline state
 * plus a periodic reachability probe against the Anthropic API.
 *
 * Singleton via `providedIn: 'root'`. Bound to the abstract via
 * `{ useExisting: TauriConnectivityService }` in app.config.
 */
@Injectable({ providedIn: 'root' })
export class TauriConnectivityService extends ConnectivityService {
  private readonly _online = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  private readonly _apiReachable = signal<boolean>(true);

  override readonly online = this._online.asReadonly();
  override readonly apiReachable = this._apiReachable.asReadonly();
  override readonly connected = computed(
    () => this._online() && this._apiReachable(),
  );

  constructor() {
    super();
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
  override async refresh(): Promise<boolean> {
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
