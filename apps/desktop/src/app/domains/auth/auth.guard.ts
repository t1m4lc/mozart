import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthFacade } from './data/auth.facade';

// Functional route guard. `/welcome` is the only route that does NOT
// carry this guard — every other route in `app.routes.ts` does.
// Phase 5 anti-regression check #1 grep-asserts this.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/welcome']);
};
