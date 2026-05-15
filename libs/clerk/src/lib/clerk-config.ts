import { InjectionToken } from '@angular/core';
import type { ClerkLoadOptions } from './clerk.types';

/** Validated, strict-shape options accepted by `provideClerk`. */
export interface ClerkConfig {
  /**
   * Clerk publishable key (starts with `pk_test_` for development or
   * `pk_live_` for production). Safe to ship in client code — it is
   * Clerk's public identifier for your instance, not a secret.
   *
   * Find it in the Clerk dashboard → API keys.
   */
  readonly publishableKey: string;

  /**
   * Optional advanced options forwarded verbatim to the underlying
   * `clerk.load(options)` call. Most apps leave this undefined and let
   * Clerk pick sensible defaults.
   */
  readonly options?: ClerkLoadOptions;
}

/** DI token resolving to the validated `ClerkConfig`. */
export const CLERK_CONFIG = new InjectionToken<ClerkConfig>('CLERK_CONFIG');
