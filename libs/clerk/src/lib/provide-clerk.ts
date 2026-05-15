import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { CLERK_CONFIG, type ClerkConfig } from './clerk-config';
import { ClerkService } from './clerk.service';

/**
 * Register Clerk for an Angular app. Loads the SDK once during
 * bootstrap (via `appInitializer`) so the first component to inject
 * `ClerkService` sees `isLoaded() === true`.
 *
 * Usage :
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideClerk({ publishableKey: 'pk_test_…' }),
 *     // …
 *   ],
 * };
 * ```
 *
 * If you need lazy loading (avoid pulling the SDK on routes that
 * don't need auth) call `ClerkService.load()` manually from a route
 * resolver instead of using `provideClerk`. The provider also binds
 * the config token so injectable usage works without manual setup.
 */
export function provideClerk(config: ClerkConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CLERK_CONFIG, useValue: config },
    provideAppInitializer(async () => {
      await inject(ClerkService).load();
    }),
  ]);
}
