import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { provideTheme } from '@mozart/shared-util-theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideFileRouter(),
    provideTheme({ theme: 'stone', mode: 'system' }),
  ],
};
