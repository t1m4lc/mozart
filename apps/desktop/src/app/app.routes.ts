import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/app-shell.component').then((m) => m.AppShellComponent),
  },
];
