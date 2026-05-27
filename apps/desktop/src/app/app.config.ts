import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  Router,
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withRouterConfig,
} from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import {
  ConnectivityService,
  ExternalLinkService,
  NotificationService,
} from '@mozart/desktop-core-data-access';
import { appRoutes } from './app.routes';
import { registerCloseFlush } from './close-flush';
import {
  provideTauriAdapters,
  TauriConnectivityService,
  TauriExternalLinkService,
  TauriNotificationService,
} from '@mozart/desktop-core-tauri';
import { AuthFacade } from '@mozart/desktop-auth-data-access';
import {
  ChatFacade,
  WorkspaceChatPort,
} from '@mozart/desktop-chat-data-access';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import {
  RouterFacade,
  SessionStore,
  UiStateFacade,
} from '@mozart/desktop-ui-state-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { UpdaterService } from '@mozart/desktop-shell-feature';

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
    // Bind the abstract core-service ports (declared in
    // `desktop-core-data-access`) to their Tauri-bound concrete impls
    // that live in `desktop-core-tauri`. Lets feature libs inject the
    // abstract class without dragging `@tauri-apps/*` into their build
    // graph.
    { provide: ConnectivityService, useExisting: TauriConnectivityService },
    { provide: ExternalLinkService, useExisting: TauriExternalLinkService },
    { provide: NotificationService, useExisting: TauriNotificationService },
    // Bind WorkspaceChatPort (declared in `desktop-chat-data-access`) to
    // the in-app WorkspacesFacade so ChatFacade can read activeId /
    // workspaceById + call markRead / toggleUnread without a
    // chat→workspaces lib dep.
    { provide: WorkspaceChatPort, useExisting: WorkspacesFacade },
    provideAppInitializer(async () => {
      // All inject() calls MUST happen synchronously before any await —
      // Angular's injection context is lost across microtasks.
      const auth = inject(AuthFacade);
      const onboarding = inject(OnboardingFacade);
      const projects = inject(ProjectsFacade);
      const workspaces = inject(WorkspacesFacade);
      const chat = inject(ChatFacade);
      const profile = inject(ProfileFacade);
      const routerFacade = inject(RouterFacade);
      const sessionStore = inject(SessionStore);
      const repos = inject(RepositoriesFacade);
      const router = inject(Router);
      const uiState = inject(UiStateFacade);
      const updater = inject(UpdaterService);

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

      // Restore last URL from the previous session. Runs INSIDE the
      // initializer so it executes before the router's first
      // navigation — the resolver authorizes the URL, redirecting to
      // a default tab if the workspace or tab id is stale.
      const lastUrl = routerFacade.bootRestoreUrl();
      if (lastUrl && router.url === '/') {
        await router.navigateByUrl(lastUrl).catch((err) => {
          console.warn('[boot] last-URL restore failed:', err);
        });
      }

      // Sidebar starts fully collapsed on boot. After the URL restore
      // settles, expand ONLY the project that owns the active
      // workspace — keeps the rest collapsed so the sidebar doesn't
      // dump every project's workspaces on screen at once.
      uiState.collapseAllProjects();
      const activeWorkspaceId = routerFacade.activeWorkspaceId();
      if (activeWorkspaceId) {
        const ws = workspaces
          .all()
          .find((w) => w.id === activeWorkspaceId);
        if (ws) uiState.expandProjects([ws.projectId]);
      }

      // Awaited so the close handler is registered before any user
      // interaction can trigger a window close. The Tauri listener
      // registration resolves in a microtask — cheap.
      await registerCloseFlush(sessionStore, repos);

      // Probe installed IDEs so the Open-in dropdown reflects what the
      // user actually has on PATH.
      void workspaces.detectIdes();
      void profile.initialize();
      void profile.initializeGithub();

      // Background updater check. Non-awaited — boot keeps moving and
      // the UpdateAvailableBanner flips on when downloadAndInstall
      // resolves. Silent failure: a broken updater never blocks usage.
      void updater.checkOnBoot();
    }),
  ],
};
