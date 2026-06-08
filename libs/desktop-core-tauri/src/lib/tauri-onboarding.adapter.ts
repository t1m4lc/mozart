import { commands } from './_bindings';
import type { OnboardingAdapter } from '@mozart/desktop-onboarding-data-access';
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '@mozart/desktop-onboarding-util';

function asStep(value: string | null): OnboardingStep | null {
  return value && (ONBOARDING_STEPS as readonly string[]).includes(value)
    ? (value as OnboardingStep)
    : null;
}

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed OnboardingAdapter. Reads / writes the
// `onboarding_completed` row in the `config` key-value table via the
// `get_onboarding_completed` / `set_onboarding_completed` commands
// added in Phase 6 / Atom 1.
export function tauriOnboardingAdapter(): OnboardingAdapter {
  return {
    async get(): Promise<boolean> {
      return unwrap(await commands.getOnboardingCompleted());
    },
    async set(value: boolean): Promise<void> {
      unwrap(await commands.setOnboardingCompleted(value));
    },
    async getStep(): Promise<OnboardingStep | null> {
      return asStep(unwrap(await commands.getOnboardingStep()));
    },
    async setStep(step: OnboardingStep): Promise<void> {
      unwrap(await commands.setOnboardingStep(step));
    },
  };
}
