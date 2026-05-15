import { Route } from '@angular/router';
import { WebShell } from './shell/web-shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: WebShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        loadComponent: () =>
          import('./pages/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'auth-callback',
        loadComponent: () =>
          import('./pages/auth-callback.page').then((m) => m.AuthCallbackPage),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard.page').then((m) => m.DashboardPage),
      },
    ],
  },
];
