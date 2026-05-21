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
  {
    path: 'code-editor',
    loadComponent: () =>
      import('./code-editor.sandbox').then((m) => m.CodeEditorSandbox),
  },
  {
    path: 'review-progress',
    loadComponent: () =>
      import('./review-progress.sandbox').then(
        (m) => m.ReviewProgressSandbox,
      ),
  },
  {
    path: 'hunk-expand-bar',
    loadComponent: () =>
      import('./hunk-expand-bar.sandbox').then((m) => m.HunkExpandBarSandbox),
  },
];
