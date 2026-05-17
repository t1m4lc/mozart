import { Route } from '@angular/router';

// Dev-only routes. Swapped with sandbox.routes.prod.ts via Angular
// `fileReplacements` in apps/desktop/project.json so the lazy chunks
// never reach the production bundle. No auth guard — sandbox is a
// dogfooding surface that must be reachable from a plain browser
// without going through the Tauri wrapper.
export const sandboxRoutes: Route[] = [
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
