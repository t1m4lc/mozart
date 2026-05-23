// Public surface of `desktop-onboarding-feature`. Smart step shells +
// guards. Routes thread through these to drive the welcome → git →
// provider → github onboarding flow.

export { FeatureOnboardingStepWelcome } from './lib/feature-onboarding-step-welcome';
export { FeatureOnboardingStepGit } from './lib/feature-onboarding-step-git';
export { FeatureOnboardingStepProvider } from './lib/feature-onboarding-step-provider';
export { FeatureOnboardingStepGithub } from './lib/feature-onboarding-step-github';
export { FeatureGitStatus } from './lib/feature-git-status';
export { FeatureClaudeLoginPty } from './lib/feature-claude-login-pty';
export { FeatureTour } from './lib/feature-tour';
export { onboardingGuard } from './lib/onboarding.guard';
export { notOnboardedGuard } from './lib/not-onboarded.guard';
