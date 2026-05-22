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
  withRouterConfig,
} from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { appRoutes } from './app.routes';
import { provideTauriAdapters } from './core/tauri-adapters';
import { AuthFacade } from '@mozart/desktop-auth-data-access';
import { ChatFacade } from './domains/chat';
import { OnboardingFacade } from './domains/onboarding';
import { ProfileFacade } from './domains/profile';
import { ProjectsFacade } from './domains/projects';
import { WorkspacesFacade } from './domains/workspaces';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `paramsInheritanceStrategy: 'always'` lets child routes inherit
    // parent route params (e.g. `:workspaceId` on the detail page is
    // surfaced as a route param on the nested tab matcher route). Without
    // this, `withComponentInputBinding()` only binds own-segment params,
    // leaving `WorkspaceTabContent.workspaceId` undefined and silently
    // breaking the composer's Send action.
    provideRouter(
      appRoutes,
      withHashLocation(),
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideTheme(),
    provideTauriAdapters(),
    provideAppInitializer(async () => {
      // All inject() calls MUST happen synchronously before any await —
      // Angular's injection context is lost across microtasks.
      const auth = inject(AuthFacade);
      const onboarding = inject(OnboardingFacade);
      const projects = inject(ProjectsFacade);
      const workspaces = inject(WorkspacesFacade);
      const chat = inject(ChatFacade);
      const profile = inject(ProfileFacade);

      // Boot auth + onboarding first so route guards see the persisted
      // state before the router resolves the initial URL.
      await auth.bootstrap();
      await onboarding.bootstrap();

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
