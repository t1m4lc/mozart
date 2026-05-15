import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { OnboardingFacade } from './data/onboarding.facade';

// Onboarding gate. When `onboarding_completed === false`, every guarded
// route that isn't `/onboarding`, `/tour`, or `/welcome` redirects back
// to `/onboarding`. This prevents URL-jumping past the wizard.
//
// `OnboardingFacade.bootstrap()` is called from `provideAppInitializer`
// so the value is hydrated before the router resolves the initial URL ;
// the guard reads the synchronous signal.
export const onboardingGuard: CanActivateFn = (): boolean | UrlTree => {
  const router = inject(Router);
  const facade = inject(OnboardingFacade);
  if (facade.isCompleted()) return true;
  return router.createUrlTree(['/onboarding']);
};
