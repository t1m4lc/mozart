import { Route } from '@angular/router';
import { AppShell } from './shell/app-shell';
import { SettingsShell } from './shell/settings-shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: AppShell,
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
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: 'sandbox',
    loadComponent: () =>
      import('./pages/sandbox/sandbox.page').then((m) => m.SandboxPage),
  },
  {
    path: 'sandbox/composer',
    loadComponent: () =>
      import('./pages/sandbox/composer.sandbox').then(
        (m) => m.ComposerSandbox,
      ),
  },
  {
    path: 'sandbox/timeline',
    loadComponent: () =>
      import('./pages/sandbox/timeline.sandbox').then(
        (m) => m.TimelineSandbox,
      ),
  },
];
