import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./sandbox.page').then((m) => m.SandboxPage),
  },
  {
    path: 'composer',
    loadComponent: () =>
      import('./composer.sandbox').then((m) => m.ComposerSandbox),
  },
];
