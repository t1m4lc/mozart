import { PLATFORM_ID, Injectable, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { TimelineDensity } from '@mozart/desktop-ui-state-util';

export type { TimelineDensity };

// Global timeline display density. Persisted in localStorage so the
// user's choice survives an app restart. Mirrors `ThemeService` from
// `libs/shared-util-theme` — same SSR-guarded write pattern, same
// "the only localStorage key from this lib" footprint.
//
// Why a dedicated service and not SessionStore? SessionStore is
// session-only by contract (see its file header). Persisting density
// there would violate that invariant. A focused service keeps the
// concern visible and the persistence rules clear.

const STORAGE_KEY = 'mozart-timeline-density-v1';
const DEFAULT_DENSITY: TimelineDensity = 'normal';
const VALID: ReadonlySet<TimelineDensity> = new Set<TimelineDensity>([
  'compact',
  'normal',
  'detailed',
]);

@Injectable({ providedIn: 'root' })
export class TimelinePrefsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _density = signal<TimelineDensity>(this.load());
  readonly density = this._density.asReadonly();

  setDensity(level: TimelineDensity): void {
    this._density.set(level);
    if (this.isBrowser) {
      try {
        localStorage.setItem(STORAGE_KEY, level);
      } catch {
        // Quota exhausted or storage disabled — silently keep the
        // in-memory signal; persistence is best-effort.
      }
    }
  }

  private load(): TimelineDensity {
    if (!this.isBrowser) return DEFAULT_DENSITY;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && (VALID as ReadonlySet<string>).has(raw)) {
        return raw as TimelineDensity;
      }
    } catch {
      // Storage disabled — fall through.
    }
    return DEFAULT_DENSITY;
  }
}
