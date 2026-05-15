import { Injectable, computed, inject, signal } from '@angular/core';
import type { Clerk } from '@clerk/clerk-js';
import { CLERK_CONFIG } from './clerk-config';
import type {
  GetTokenOptions,
  OAuthStrategy,
  SessionResource,
  UserResource,
} from './clerk.types';

/** Arguments for a redirect-based OAuth sign-in. */
export interface ClerkRedirectOptions {
  /**
   * Where Clerk routes the browser after the OAuth provider returns.
   * Usually `/auth-callback` — the page where the app waits for
   * Clerk's session to resolve and then routes onward.
   */
  readonly redirectUrl: string;

  /**
   * Where Clerk routes the browser once the session is fully active.
   * Typically the post-sign-in landing page (e.g. `/dashboard`).
   */
  readonly redirectUrlComplete: string;
}

/**
 * Angular wrapper around the `@clerk/clerk-js` SDK.
 *
 * Lifecycle :
 *   - `provideClerk()` registers an `appInitializer` that awaits
 *     `load()` so by the time any feature injects this service the
 *     Clerk instance is loaded and `isLoaded()` is `true`.
 *   - `load()` is idempotent ; calling it twice is a no-op.
 *
 * Reactivity :
 *   - The service subscribes to Clerk's `addListener` and mirrors
 *     `user` + `session` into signals. Components consume them as
 *     `Signal<UserResource | null>` / `Signal<SessionResource | null>`
 *     and derive booleans via `computed()`.
 *   - Setting a signal triggers Angular change detection regardless of
 *     the zone the callback fires in — no `NgZone.run()` wrapping.
 *
 * Bundle size :
 *   - `@clerk/clerk-js` is dynamically imported inside `load()` so the
 *     SDK lives in its own chunk and the main bundle stays small.
 */
@Injectable({ providedIn: 'root' })
export class ClerkService {
  private readonly config = inject(CLERK_CONFIG);

  /** Loaded Clerk instance. `null` before `load()` resolves. */
  private clerk: Clerk | null = null;

  /** Pending load promise — guards against duplicate `load()` calls. */
  private loadPromise: Promise<void> | null = null;

  private readonly _isLoaded = signal(false);
  private readonly _user = signal<UserResource | null>(null);
  private readonly _session = signal<SessionResource | null>(null);

  /** True once the SDK has finished loading and is ready to use. */
  readonly isLoaded = this._isLoaded.asReadonly();
  readonly user = this._user.asReadonly();
  readonly session = this._session.asReadonly();
  readonly isSignedIn = computed(() => this._user() !== null);

  /**
   * Load the Clerk SDK + initialize the singleton instance. Safe to
   * call multiple times — only the first call performs work. Wired by
   * `provideClerk` as an `appInitializer`, so most callers do not need
   * to await this manually.
   */
  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    const { Clerk } = await import('@clerk/clerk-js');
    const clerk = new Clerk(this.config.publishableKey);
    await clerk.load(this.config.options);

    // Mirror initial state before the listener wires up so the first
    // synchronous read after `load()` returns is correct.
    this._user.set(clerk.user ?? null);
    this._session.set(clerk.session ?? null);

    // Keep signals in sync with every subsequent Clerk state change
    // (sign-in, sign-out, session refresh, user profile update, …).
    clerk.addListener((resources) => {
      this._user.set(resources.user ?? null);
      this._session.set(resources.session ?? null);
    });

    this.clerk = clerk;
    this._isLoaded.set(true);
  }

  /**
   * Trigger a redirect-based OAuth sign-in. The browser navigates to
   * the provider (GitHub, Google, …), the user authorizes, and is
   * routed back to `redirectUrl`. Once the session is fully active,
   * Clerk routes onward to `redirectUrlComplete`.
   *
   * Returns once the redirect has been initiated — the page is about
   * to unload, so awaiting beyond this point is not meaningful.
   */
  async signInWithOAuth(
    strategy: OAuthStrategy,
    redirect: ClerkRedirectOptions,
  ): Promise<void> {
    const clerk = this.requireClerk();
    // The SDK's `authenticateWithRedirect` types `strategy` as a
    // narrower union than our public `OAuthStrategy` (it adds
    // 'enterprise_sso'). Cast at this single boundary — consumers see
    // our wider type, the SDK still validates at runtime.
    await clerk.client?.signIn?.authenticateWithRedirect({
      strategy: strategy as Parameters<
        NonNullable<
          NonNullable<Clerk['client']>['signIn']
        >['authenticateWithRedirect']
      >[0]['strategy'],
      redirectUrl: redirect.redirectUrl,
      redirectUrlComplete: redirect.redirectUrlComplete,
    });
  }

  /**
   * Sign the current user out. Optional `redirectUrl` controls where
   * the browser lands after the session is cleared ; omit it to stay
   * on the current page.
   */
  async signOut(redirectUrl?: string): Promise<void> {
    const clerk = this.requireClerk();
    await clerk.signOut(redirectUrl ? { redirectUrl } : undefined);
  }

  /**
   * Fetch a JWT for the current session. Without options, returns the
   * default Clerk session token. Pass `{ template: 'mozart' }` (or any
   * template name configured in the Clerk dashboard) to receive a
   * token shaped to your custom claim set.
   *
   * Returns `null` when there is no active session.
   */
  async getToken(opts?: GetTokenOptions): Promise<string | null> {
    const session = this._session();
    if (!session) return null;
    return session.getToken(opts);
  }

  /**
   * Re-fetch the user + session from Clerk's servers. Useful after a
   * profile update or an external metadata change that the listener
   * may not have caught.
   */
  async reload(): Promise<void> {
    const clerk = this.requireClerk();
    await clerk.user?.reload();
  }

  private requireClerk(): Clerk {
    if (!this.clerk) {
      throw new Error(
        '[clerk] action invoked before load() completed — provideClerk should be in the providers list',
      );
    }
    return this.clerk;
  }
}
