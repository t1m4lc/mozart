import { InjectionToken } from '@angular/core';
import type { Theme, ThemeMode } from './theme.types';

/// Optional durable backing store for theme + color mode. When provided
/// (desktop, via settings.json), `ThemeService` keeps localStorage as the
/// synchronous first-paint cache and reconciles against this store on init,
/// writing through on every change. When absent (web/landing/sandbox, which
/// have no backend), the service stays localStorage-only — unchanged.
export interface ThemePersistence {
  load(): Promise<{ theme?: Theme; mode?: ThemeMode }>;
  save(value: { theme: Theme; mode: ThemeMode }): Promise<void>;
}

export const THEME_PERSISTENCE = new InjectionToken<ThemePersistence>(
  'THEME_PERSISTENCE',
);
