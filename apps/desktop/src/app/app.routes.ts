import { Route, type CanActivateFn } from '@angular/router';
import { loadXterm } from '@mozart/desktop-core-util';
import { authGuard } from '@mozart/desktop-auth-data-access';
import { notOnboardedGuard, onboardingGuard } from '@mozart/desktop-onboarding-feature';
import {
  tabMatcher,
  workspaceTabCanActivate,
} from '@mozart/desktop-workspaces-data-access';
import { AppShell, SettingsShell } from '@mozart/desktop-shell-feature';

// Preload xterm.js modules before the workspace-detail route activates.
// RunRegistry.ensureEntry() runs from computed signals on first render
// and stays synchronous, so the chunk must be cached by the time the
// page mounts. Keeps xterm (~290 kB) out of the eager shell bundle.
const xtermPreloadGuard: CanActivateFn = async () => {
  await loadXterm();
  return true;
};

export const appRoutes: Route[] = [
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, notOnboardedGuard],
    loadComponent: () =>
      import('./pages/onboarding.page').then((m) => m.OnboardingPage),
  },
  // /tour is parked: the overlay is optional and the 5-step walkthrough
  // isn't ready yet. Re-enable by uncommenting this route + the Replay
  // tour section in settings.page.ts. The `pages/tour.page.ts` and
  // `desktop-onboarding-feature` tour atoms are kept in-tree.
  // {
  //   path: 'tour',
  //   canActivate: [authGuard],
  //   loadComponent: () => import('./pages/tour.page').then((m) => m.TourPage),
  // },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard, onboardingGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/dashboard.page').then((m) => m.DashboardPage),
      },
      { path: 'workspaces', pathMatch: 'full', redirectTo: '' },
      {
        path: 'project/:projectId/workspace/:workspaceId',
        canActivate: [xtermPreloadGuard],
        loadComponent: () =>
          import('@mozart/desktop-workspaces-feature').then(
            (m) => m.WorkspaceDetailPage,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'tab/default' },
          {
            matcher: tabMatcher,
            canActivate: [workspaceTabCanActivate],
            loadComponent: () =>
              import('@mozart/desktop-workspaces-feature').then(
                (m) => m.WorkspaceTabContent,
              ),
          },
        ],
      },
    ],
  },
  {
    path: 'settings',
    component: SettingsShell,
    canActivate: [authGuard, onboardingGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/settings.page').then((m) => m.SettingsPage),
      },
      // Projects section — lives under /settings so the sidebar
      // chrome (Back to app + section list) and the routing entry
      // point match the global settings page. `/settings/projects`
      // renders the picker / first-project landing; `:projectId`
      // selects an individual project for editing.
      {
        path: 'projects',
        loadComponent: () =>
          import('./pages/project-settings.page').then(
            (m) => m.ProjectSettingsPage,
          ),
      },
      {
        path: 'projects/:projectId',
        loadComponent: () =>
          import('./pages/project-settings.page').then(
            (m) => m.ProjectSettingsPage,
          ),
      },
    ],
  },
];
