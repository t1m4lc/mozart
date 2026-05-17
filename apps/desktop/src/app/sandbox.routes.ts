import { Route } from '@angular/router';
import { authGuard } from './domains/auth';

// Dev-only routes. Swapped with sandbox.routes.prod.ts via Angular
// `fileReplacements` in apps/desktop/project.json so the lazy chunks
// never reach the production bundle.
export const sandboxRoutes: Route[] = [
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
  {
    path: 'sandbox/timeline',
    loadComponent: () =>
      import('./pages/sandbox/timeline.sandbox').then(
        (m) => m.TimelineSandbox,
      ),
  },
];
