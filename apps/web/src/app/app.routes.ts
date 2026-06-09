import { Route } from '@angular/router';
import {
  redirectIfAuthedGuard,
  requireAuthGuard,
} from './domains/auth/auth.guard';
import { WebShell } from './shell/web-shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: WebShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      {
        path: 'login',
        canActivate: [redirectIfAuthedGuard],
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
        canActivate: [requireAuthGuard],
        loadComponent: () =>
          import('./pages/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'account',
        canActivate: [requireAuthGuard],
        loadComponent: () =>
          import('./pages/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'logout',
        loadComponent: () =>
          import('./pages/logout.page').then((m) => m.LogoutPage),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./pages/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },
];
