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
import { appRoutes } from './app.routes';
import { provideTauriAdapters } from './core/tauri-adapters';
import { AUTH_ADAPTER, AuthFacade } from './domains/auth';
import { fakeAuthAdapter } from './domains/auth/data/fake-auth.adapter';
import { ChatFacade } from './domains/chat';
import { ProfileFacade } from './domains/profile';
import { ProjectsFacade } from './domains/projects';
import { WorkspacesFacade } from './domains/workspaces';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation(), withComponentInputBinding()),
    provideTheme(),
    provideTauriAdapters(),
    // Atom 1 binding : fully in-memory auth. Atom 2 moves this into
    // `provideTauriAdapters()` once the Tauri-backed adapter exists.
    { provide: AUTH_ADAPTER, useValue: fakeAuthAdapter() },
    provideAppInitializer(async () => {
      // All inject() calls MUST happen synchronously before any await —
      // Angular's injection context is lost across microtasks.
      const auth = inject(AuthFacade);
      const projects = inject(ProjectsFacade);
      const workspaces = inject(WorkspacesFacade);
      const chat = inject(ChatFacade);
      const profile = inject(ProfileFacade);

      // Boot auth first so the route guard sees the persisted session
      // before the router resolves the initial URL.
      await auth.bootstrap();

      try {
        await projects.loadAll();
        await workspaces.loadAll();
        await chat.loadAllChats();
      } catch (err) {
        console.error('hydration failed on boot', err);
      }
      // Probe installed IDEs so the Open-in dropdown reflects what the
      // user actually has on PATH.
      void workspaces.detectIdes();
      void profile.initialize();
      void profile.initializeGithub();
    }),
  ],
};
