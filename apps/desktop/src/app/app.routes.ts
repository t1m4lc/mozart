import { Route } from '@angular/router';
import { authGuard } from './domains/auth';
import { notOnboardedGuard, onboardingGuard } from './domains/onboarding';
import { sandboxRoutes } from './sandbox.routes';
import { AppShell } from './shell/app-shell';
import { SettingsShell } from './shell/settings-shell';

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
    loadComponent: () =>
      import('./pages/tour.page').then((m) => m.TourPage),
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
        path: 'workspaces/:id',
        loadComponent: () =>
          import('./domains/workspaces').then((m) => m.WorkspaceDetailPage),
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
  ...sandboxRoutes,
];
