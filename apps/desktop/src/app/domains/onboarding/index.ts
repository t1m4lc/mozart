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
export {
  GIT_CHECK_ADAPTER,
  type GitCheckAdapter,
} from './data/git-check.adapter';
export {
  PROVIDER_SETUP_ADAPTER,
  type ProviderSetupAdapter,
} from './data/provider-setup.adapter';
export { onboardingGuard } from './onboarding.guard';
export { UiOnboardingStepShell } from './ui-onboarding-step-shell';
export { UiDisclosureCard } from './ui-disclosure-card';
export { FeatureOnboardingStepWelcome } from './feature-onboarding-step-welcome';
export { FeatureOnboardingStepGit } from './feature-onboarding-step-git';
export { FeatureOnboardingStepProvider } from './feature-onboarding-step-provider';
export { FeatureClaudeLoginPty } from './feature-claude-login-pty';
