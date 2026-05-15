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
    provideAppInitializer(async () => {
      const projects = inject(ProjectsFacade);
      const workspaces = inject(WorkspacesFacade);
      const chat = inject(ChatFacade);
      const profile = inject(ProfileFacade);
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
