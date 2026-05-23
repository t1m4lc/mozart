// Public surface of `desktop-onboarding-data-access`. Facade + Tauri
// ports for the onboarding flow. Tauri-bound concrete adapters live in
// `apps/desktop/src/app/core/`.

export { OnboardingFacade } from './lib/onboarding.facade';
export {
  ONBOARDING_ADAPTER,
  type OnboardingAdapter,
} from './lib/onboarding.adapter';
export {
  GIT_CHECK_ADAPTER,
  type GitCheckAdapter,
  type GitIdentity,
} from './lib/git-check.adapter';
export {
  PROVIDER_SETUP_ADAPTER,
  type ProviderSetupAdapter,
} from './lib/provider-setup.adapter';
export {
  GET_STARTED_PROJECT_ADAPTER,
  type GetStartedProjectAdapter,
  type GetStartedResult,
} from './lib/get-started-project.adapter';
