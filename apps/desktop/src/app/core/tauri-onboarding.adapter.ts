import { commands } from './_bindings';
import type { OnboardingAdapter } from '@mozart/desktop-onboarding-data-access';

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
  };
}
