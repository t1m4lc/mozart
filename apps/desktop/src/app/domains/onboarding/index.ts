// Public surface of the `onboarding` domain. Stores stay private ;
// adapter token is exported so `core/tauri-adapters.ts` can bind it.

export type {
  OnboardingStep,
  StepStatus,
} from './data/onboarding.model';
export { ONBOARDING_STEPS } from './data/onboarding.model';
export { OnboardingFacade } from './data/onboarding.facade';
export {
  ONBOARDING_ADAPTER,
  type OnboardingAdapter,
} from './data/onboarding.adapter';
export { onboardingGuard } from './onboarding.guard';
export { UiOnboardingStepShell } from './ui-onboarding-step-shell';
