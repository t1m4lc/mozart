import { InjectionToken } from '@angular/core';

// Onboarding-IO port. Concrete impl is bound in `app.config.ts`. The
// boolean is mirrored in the `config` SQLite table on the Rust side ;
// it survives restarts independently of the (mocked) JWT claim, so a
// user who completed onboarding on this machine doesn't re-onboard
// when the JWT resets the claim on next sign-in.
//
// No file under `domains/onboarding/` outside `tauri-*.adapter.ts` may
// import from `@tauri-apps/*` or `core/_bindings` directly
// (Convention #2).
export interface OnboardingAdapter {
  /** Read the persisted flag. Missing row → false. */
  get(): Promise<boolean>;
  /** Persist the flag. Called from `complete()` and from settings. */
  set(value: boolean): Promise<void>;
}

export const ONBOARDING_ADAPTER = new InjectionToken<OnboardingAdapter>(
  'ONBOARDING_ADAPTER',
);
