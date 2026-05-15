import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { AuthSession, DeepLinkPayload } from './auth.model';

// Auth-IO port. The concrete impl is bound in `app.config.ts`. In Atom 1
// the binding is `fakeAuthAdapter` (fully in-memory) ; from Atom 2 onward
// a Tauri-backed impl gradually replaces it.
//
// No file under `domains/auth/` outside `*-auth.adapter.ts` may import
// from `@tauri-apps/*` or `core/_bindings` directly (Convention #2).
export interface AuthAdapter {
  /** Read the persisted session at boot. Returns null when none. */
  loadSession(): Promise<AuthSession | null>;

  /** Persist a freshly-validated session. */
  saveSession(session: AuthSession): Promise<void>;

  /** Sign out — clear the persisted session. */
  clearSession(): Promise<void>;

  /**
   * Open the user's default browser at `args.url`. The `state` is the
   * OAuth nonce the facade generated and embedded in the URL ; the
   * adapter doesn't validate it (the facade does on deep-link arrival).
   */
  openSignIn(args: {
    readonly url: string;
    readonly state: string;
  }): Promise<void>;

  /**
   * Stream of `mozart://auth?...` deep-link callbacks. Hot observable
   * — subscribers receive emissions from subscription time forward.
   */
  readonly deepLink$: Observable<DeepLinkPayload>;
}

export const AUTH_ADAPTER = new InjectionToken<AuthAdapter>('AUTH_ADAPTER');
