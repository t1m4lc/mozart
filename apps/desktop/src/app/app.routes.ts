import { Route, type CanActivateFn } from '@angular/router';
import { loadXterm } from '@mozart/desktop-core-util';
import { authGuard } from '@mozart/desktop-auth-data-access';
import { notOnboardedGuard, onboardingGuard } from '@mozart/desktop-onboarding-feature';
import {
  tabMatcher,
  workspaceTabCanActivate,
} from './domains/workspaces/feature-detail/workspace-tab-routes';
import { AppShell } from './shell/app-shell';
import { SettingsShell } from './shell/settings-shell';

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
  {
    path: 'tour',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tour.page').then((m) => m.TourPage),
  },
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
          import('./domains/workspaces').then((m) => m.WorkspaceDetailPage),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'tab/default' },
          {
            matcher: tabMatcher,
            canActivate: [workspaceTabCanActivate],
            loadComponent: () =>
              import(
                './domains/workspaces/feature-detail/workspace-tab-content'
              ).then((m) => m.WorkspaceTabContent),
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
        loadComponent: () =>
          import('./pages/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
];
