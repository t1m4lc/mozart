import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge } from 'rxjs';

// Hosted-LLM probe target. HEAD is cheap, anthropic.com is the
// authoritative endpoint for the Anthropic API users actually need.
// A failure here can be DNS / firewall / outage / wifi-down — any of
// which mean "non-local LLM unreachable" from the user's machine.
const PROBE_URL = 'https://api.anthropic.com/v1';
const PROBE_INTERVAL_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      // `no-cors` keeps us out of CORS-preflight territory; we only
      // care about whether the fetch resolves, not the body. Any 2xx
      // / 3xx / 4xx counts as "reachable" — only network failures
      // (DNS, connection refused, timeout) flip apiReachable to false.
      await fetch(PROBE_URL, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store',
      });
      this._apiReachable.set(true);
    } catch {
      this._apiReachable.set(false);
    } finally {
      clearTimeout(timeout);
    }
  }
}
