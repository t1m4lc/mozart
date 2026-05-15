import { Route } from '@angular/router';
import { authGuard } from './domains/auth';
import { AppShell } from './shell/app-shell';
import { SettingsShell } from './shell/settings-shell';

export const appRoutes: Route[] = [
  {
    path: 'welcome',
    loadComponent: () =>
      import('./pages/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard],
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
    canActivate: [authGuard],
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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/sandbox/sandbox.page').then((m) => m.SandboxPage),
  },
  {
    path: 'sandbox/composer',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/sandbox/composer.sandbox').then(
        (m) => m.ComposerSandbox,
      ),
  },
];
