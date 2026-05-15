import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthFacade } from './data/auth.facade';

/**
 * Guard for `/dashboard` (and any other authenticated-only route).
 * Sends unauthenticated visitors to `/login`. The `authed` check is
 * a synchronous signal read — `ClerkService.load()` has resolved by
 * the time any route is activated (registered via `provideAppInitializer`
 * in `provideClerk`).
 */
export const requireAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

/**
 * Guard for `/login`. Sends already-authenticated visitors to
 * `/dashboard` so the page only ever renders the OAuth buttons —
 * the "dual-state" version with a Launch button inline is gone now
 * that `/dashboard` carries that affordance and Sign out lives there
 * too. Preserves any inbound desktop handoff query params
 * (`?state=…&port=…`) on the redirect so the dashboard's Launch flow
 * still has them.
 */
export const redirectIfAuthedGuard: CanActivateFn = (route) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  const queryParams = { ...route.queryParams };
  return router.createUrlTree(['/dashboard'], { queryParams });
};
