// Domain types for the onboarding wizard. Free of wire vocabulary —
// the Tauri side stores the flag in `config(key='onboarding_completed')`
// but the facade exposes a plain boolean.

/** The four wizard steps, in order. */
export type OnboardingStep = 'welcome' | 'git' | 'provider' | 'github';

/** Per-step completion state. */
export type StepStatus = 'pending' | 'ready' | 'done' | 'skipped';

/** Ordered list — used by the progress pill and step transitions. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'git',
  'provider',
  'github',
] as const;
