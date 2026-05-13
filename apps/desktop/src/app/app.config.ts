import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
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
import { commands } from './core/_bindings';
import { appRoutes } from './app.routes';
import {
  CREDENTIALS_ADAPTER,
  type CredentialsAdapter,
  ProfileFacade,
} from './domains/profile';
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
    // Tauri-backed credentials adapter for the Anthropic key. This is the
    // ONLY file in the app that touches `core/_bindings` for credentials —
    // the profile domain stays Tauri-agnostic per Convention #2.
    {
      provide: CREDENTIALS_ADAPTER,
      useFactory: (): CredentialsAdapter => ({
        async hasStoredKey() {
          const r = await commands.hasAnthropicKey();
          if (r.status === 'error') throw new Error(r.error.kind);
          return r.data;
        },
        async hasClaudeCodeSession() {
          // Returns plain boolean (not Result-wrapped) — see commands/mod.rs.
          return await commands.checkClaudeCodeSession();
        },
        async connect(key: string) {
          const r = await commands.connectAnthropic(key);
          if (r.status === 'error') throw new Error(r.error.kind);
          return r.data.kind;
        },
        async clear() {
          const r = await commands.disconnectAnthropic();
          if (r.status === 'error') throw new Error(r.error.kind);
        },
        async refresh() {
          const r = await commands.refreshAnthropicConnection();
          if (r.status === 'error') throw new Error(r.error.kind);
          return r.data.kind;
        },
      }),
    },
    // Fire-and-forget probe at app start so /settings is up-to-date even
    // when the user doesn't open the settings page first. The facade's
    // own `status === 'unknown'` guard makes this idempotent with the
    // lazy call in feature-connections.constructor.
    provideAppInitializer(() => {
      void inject(ProfileFacade).initialize();
    }),
  ],
};
