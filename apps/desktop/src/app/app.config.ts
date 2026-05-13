import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
} from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { homeDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { appRoutes } from './app.routes';
import { DIALOG_ADAPTER } from './domains/projects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation(), withComponentInputBinding()),
    provideTheme(),
    {
      provide: DIALOG_ADAPTER,
      useFactory: () => ({
        async pickFolder(opts?: { defaultPath?: string }) {
          const result = await openDialog({
            directory: true,
            multiple: false,
            defaultPath: opts?.defaultPath ?? (await homeDir()),
          });
          return typeof result === 'string' ? result : null;
        },
      }),
    },
  ],
};
