import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClerk } from '@mozart/clerk';
import { POSTHOG_HOST, POSTHOG_KEY } from '@mozart/shared-util-analytics';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    provideClerk({ publishableKey: import.meta.env.CLERK_PUBLISHABLE_KEY }),
    { provide: POSTHOG_KEY, useValue: import.meta.env.POSTHOG_KEY },
    { provide: POSTHOG_HOST, useValue: import.meta.env.POSTHOG_HOST },
  ],
};
