import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClerk } from '@mozart/clerk';
import { provideTheme } from '@mozart/shared-util-theme';
import { env } from '../env';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    // Loads the Clerk SDK once at bootstrap. `AuthFacade` and any
    // page can inject `ClerkService` directly afterwards. The
    // publishable key lives in `apps/web/src/env.ts` — see
    // docs/setup-clerk.md for the Clerk dashboard walkthrough.
    provideClerk({ publishableKey: env.clerkPublishableKey }),
  ],
};
