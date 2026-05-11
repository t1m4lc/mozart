import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';
import { BindingsService } from './services/bindings.service';

/**
 * Debug seam — when running under `pnpm dev` (`isDevMode()`), expose
 * the `BindingsService` instance on `window.__mz` so the manual smoke
 * test from `TASKS.md` can poke at the IPC layer from DevTools:
 *
 *   await window.__mz.bindings.listRepos();
 *
 * In production builds `isDevMode()` returns false and the seam is a
 * no-op (the line still ships but doesn't execute).
 */
interface MozartDevHandle {
  readonly bindings: BindingsService;
}
declare global {
  interface Window {
    __mz?: MozartDevHandle;
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation()),
    provideTheme(),
    provideAppInitializer(() => {
      if (isDevMode()) {
        window.__mz = { bindings: inject(BindingsService) };
      }
    }),
  ],
};
