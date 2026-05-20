import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  INTERNAL_DEVICE_COOKIE,
  INTERNAL_DEVICE_TOKEN_PARAM,
  readInternalTokenFromUrl,
} from './analytics-core';
import { CookieService } from './cookie.service';

const OPT_IN_WELCOME =
  'Welcome to the crew! This device is now marked internal.';

const IS_INTERNAL_ENDPOINT = '/api/analytics/is-internal-device';
const SET_INTERNAL_ENDPOINT = '/api/analytics/set-internal-device';

type IsInternalResponse = { readonly isInternalDevice: boolean };

/**
 * Owns everything about the "internal device" marker:
 *   - reading the opt-in token from the current URL
 *   - asking the server to persist the cookie (token validation is server-side)
 *   - resolving the authoritative boolean via the API endpoint
 *
 * The cookie itself is set by the Cloudflare Function, not by this service.
 * Client-side cookie read goes through CookieService for sync fallback only.
 */
@Injectable({ providedIn: 'root' })
export class InternalDeviceService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cookies = inject(CookieService);
  private resolved: boolean | null = null;

  /** Authoritative resolution: opts in if needed, then queries the API. */
  async resolve(): Promise<boolean> {
    if (!this.isBrowser) return false;
    await this.maybeOptIn();
    const fromApi = await this.fetchStatus();
    this.resolved = fromApi;
    return fromApi;
  }

  /** Sync best-effort: cached API result if available, else raw cookie hint. */
  snapshot(): boolean {
    if (this.resolved !== null) return this.resolved;
    return this.cookies.has(INTERNAL_DEVICE_COOKIE);
  }

  private async maybeOptIn(): Promise<void> {
    const token = readInternalTokenFromUrl(window.location.href);
    if (!token) return;
    let ok = false;
    try {
      const res = await fetch(SET_INTERNAL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    // Always strip the token from the visible URL — even on failure, so a
    // wrong-token URL doesn't end up in screenshots, bookmarks, or referrers.
    this.scrubTokenFromUrl();
    if (ok) window.alert(OPT_IN_WELCOME);
  }

  private scrubTokenFromUrl(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(INTERNAL_DEVICE_TOKEN_PARAM)) return;
    url.searchParams.delete(INTERNAL_DEVICE_TOKEN_PARAM);
    const search = url.searchParams.toString();
    const next = url.pathname + (search ? `?${search}` : '') + url.hash;
    history.replaceState(history.state, '', next);
  }

  private async fetchStatus(): Promise<boolean> {
    try {
      const res = await fetch(IS_INTERNAL_ENDPOINT, {
        credentials: 'same-origin',
      });
      if (!res.ok) return false;
      const json = (await res.json()) as IsInternalResponse;
      return Boolean(json.isInternalDevice);
    } catch {
      return false;
    }
  }
}
