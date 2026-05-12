import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'legacy',
    loadComponent: () =>
      import('./legacy/shell/app-shell.component').then(
        (m) => m.AppShellComponent,
      ),
  },
];
