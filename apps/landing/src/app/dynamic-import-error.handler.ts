import { ErrorHandler, Injectable } from '@angular/core';

const RELOAD_KEY = 'mozart:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

// A lazy route chunk can fail to load for reasons unrelated to app code: a
// transient network change mid-fetch, or stale chunk hashes left in a tab
// after a deploy purged the ones it references. Angular's router has no
// recovery — the navigation stays dead until reload. Reload once, with a
// cooldown so a genuinely missing chunk can't loop.
@Injectable()
export class DynamicImportErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (
      typeof window !== 'undefined' &&
      this.isDynamicImportError(error) &&
      this.canReload()
    ) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      location.reload();
      return;
    }
    console.error(error);
  }

  private isDynamicImportError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
      message,
    );
  }

  private canReload(): boolean {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - last > RELOAD_COOLDOWN_MS;
  }
}
