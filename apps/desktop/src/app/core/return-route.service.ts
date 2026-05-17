import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

const SETTINGS_PREFIX = '/settings';
const DEFAULT_RETURN = '/';

// Remembers the last in-app URL before the user navigated into
// /settings so the Settings sidebar's "Back to app" link can return
// to that exact route (with query params + tab state). Initialized
// to '/' so a fresh-start direct deep-link into /settings still has
// a sane target.
@Injectable({ providedIn: 'root' })
export class ReturnRouteService {
  private readonly router = inject(Router);
  private readonly _previous = signal<string>(DEFAULT_RETURN);
  readonly previous = this._previous.asReadonly();

  constructor() {
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      const url = event.urlAfterRedirects;
      // Don't overwrite previous when navigating into /settings — we
      // want to remember where we came FROM, not the settings route.
      if (this.isSettings(url)) return;
      this._previous.set(url || DEFAULT_RETURN);
    });
  }

  private isSettings(url: string): boolean {
    return url === SETTINGS_PREFIX || url.startsWith(`${SETTINGS_PREFIX}/`);
  }
}
