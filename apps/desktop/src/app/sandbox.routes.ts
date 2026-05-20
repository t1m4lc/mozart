import { Route } from '@angular/router';

// Dev-only routes. Swapped with sandbox.routes.prod.ts via Angular
// `fileReplacements` in apps/desktop/project.json so the lazy chunks
// never reach the production bundle. No auth guard — sandbox is a
// dogfooding surface that must be reachable from a plain browser
// without going through the Tauri wrapper.
//
// composer + sandbox index moved to apps/sandbox. Only the timeline
// sandbox stays here because it depends on the llm-model domain
// (reducer + JSON fixtures) which is not yet a lib. Once llm-model
// is promoted, timeline.sandbox moves to apps/sandbox too.
export const sandboxRoutes: Route[] = [
  {
    path: 'sandbox/timeline',
    loadComponent: () =>
      import('./pages/sandbox/timeline.sandbox').then(
        (m) => m.TimelineSandbox,
      ),
  },
  {
    path: 'sandbox/hunk-expand-bar',
    loadComponent: () =>
      import('./pages/sandbox/hunk-expand-bar.sandbox').then(
        (m) => m.HunkExpandBarSandbox,
      ),
  },
];
