import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';
import { AUTH_ADAPTER } from './domains/auth';
import { mockClerkAdapter } from './domains/auth/data/mock-clerk.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideTheme(),
    // Atom 5 binding : mock Clerk. Swap for a `@clerk/angular`-backed
    // adapter post-MVP without touching consumers.
    { provide: AUTH_ADAPTER, useFactory: () => mockClerkAdapter() },
  ],
};
