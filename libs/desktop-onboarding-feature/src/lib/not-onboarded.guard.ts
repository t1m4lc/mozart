import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';

// Inverse of `onboardingGuard`. Protects the `/onboarding` route so a
// returning user with `onboarding_completed === true` can't URL-jump
// back into the wizard. The auth guard still runs first, so sign-in
// flows (which hit `/onboarding` immediately after auth, before
// `OnboardingFacade.bootstrap()` has flipped the flag) resolve
// normally — only completed users get bounced.
export const notOnboardedGuard: CanActivateFn = (): boolean | UrlTree => {
  const router = inject(Router);
  const facade = inject(OnboardingFacade);
  if (facade.isCompleted()) return router.createUrlTree(['/']);
  return true;
};
