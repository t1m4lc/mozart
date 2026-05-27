import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClerk } from '@mozart/clerk';
import { POSTHOG_HOST, POSTHOG_KEY } from '@mozart/shared-util-analytics';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    provideClerk({ publishableKey: environment.clerkPublishableKey }),
    { provide: POSTHOG_KEY, useValue: environment.posthogKey },
    { provide: POSTHOG_HOST, useValue: environment.posthogHost },
  ],
};
