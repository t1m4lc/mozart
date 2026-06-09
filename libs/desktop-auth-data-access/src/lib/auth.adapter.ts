import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { AuthSession, DeepLinkPayload } from '@mozart/desktop-auth-util';

// Auth-IO port. The concrete impl is bound in `app.config.ts`. In Atom 1
// the binding is `fakeAuthAdapter` (fully in-memory) ; from Atom 2 onward
// a Tauri-backed impl gradually replaces it.
//
// No file in `desktop-auth-data-access` / `desktop-auth-ui` /
// `desktop-auth-feature` / `desktop-auth-util` may import from
// `@tauri-apps/*` or `core/_bindings`. The Tauri-backed impl lives in
// `apps/desktop/src/app/core/tauri-auth.adapter.ts` — the only file
// permitted to bridge this port to Tauri (Convention #2).
export interface AuthAdapter {
  /** Read the persisted session at boot. Returns null when none. */
  loadSession(): Promise<AuthSession | null>;

  /** Persist a freshly-validated session. */
  saveSession(session: AuthSession): Promise<void>;

  /** Sign out — clear the persisted session. */
  clearSession(): Promise<void>;

  /**
   * Persist onboarding completion to the cross-surface source of truth
   * (Clerk `unsafe_metadata.onboarding`). The Tauri impl proxies through
   * the web backend in Rust to dodge Clerk's Frontend-API CORS block on
   * `tauri.localhost`. Best-effort — the local mirror is authoritative
   * for the desktop guard, so a failure here must not strand the user.
   */
  markOnboardingComplete(): Promise<void>;

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
   * Port of the localhost HTTP callback server. The facade embeds it
   * in the apps/web sign-in URL (`?port=…`) so the browser-side
   * `Launch Mozart desktop` button can `fetch()` directly into Mozart
   * — bypasses the unreliable `mozart://` scheme handoff on Linux.
   *
   * Returns `0` if the server failed to bind at desktop boot. The
   * apps/web UI uses that as "Mozart isn't running" — fail-closed.
   */
  getCallbackPort(): Promise<number>;

  /**
   * Stream of `mozart://auth?...` deep-link callbacks. Hot observable
   * — subscribers receive emissions from subscription time forward.
   *
   * Both transports feed this stream : the OS-level `mozart://` scheme
   * handler (`deep_link.rs`) and the localhost HTTP callback server
   * (`http_callback.rs`). The adapter is transport-agnostic — it sees
   * a single source of `DeepLinkPayload`s.
   */
  readonly deepLink$: Observable<DeepLinkPayload>;
}

export const AUTH_ADAPTER = new InjectionToken<AuthAdapter>('AUTH_ADAPTER');
