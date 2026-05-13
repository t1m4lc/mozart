import { Route } from '@angular/router';
import { AppShell } from './shell/app-shell';
import { SettingsShell } from './shell/settings-shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'workspaces' },
      {
        path: 'workspaces',
        loadComponent: () =>
          import('./pages/workspace.page').then((m) => m.WorkspacePage),
      },
      {
        path: 'workspaces/:id',
        loadComponent: () =>
          import('./pages/workspace.page').then((m) => m.WorkspacePage),
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
    path: 'legacy',
    loadComponent: () =>
      import('./legacy/shell/app-shell.component').then(
        (m) => m.AppShellComponent,
      ),
  },
];
