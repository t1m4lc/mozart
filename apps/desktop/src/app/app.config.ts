import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation()),
    provideTheme(),
  ],
};
