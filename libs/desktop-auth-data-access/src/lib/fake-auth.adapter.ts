import { Subject } from 'rxjs';
import type { AuthAdapter } from './auth.adapter';
import type { AuthSession, DeepLinkPayload } from '@mozart/desktop-auth-util';

// Fully in-memory AuthAdapter for Atom 1. Holds a single session in
// closure state ; clicking Sign in schedules a fake deep-link after a
// 1 s delay (echoes the state nonce back unchanged). Atom 2 swaps this
// for the Tauri-backed adapter once `tauri-plugin-deep-link` is wired.
export function fakeAuthAdapter(): AuthAdapter {
  let session: AuthSession | null = null;
  const deepLink$ = new Subject<DeepLinkPayload>();

  return {
    async loadSession() {
      return session;
    },
    async saveSession(s) {
      session = s;
    },
    async clearSession() {
      session = null;
    },
    async openSignIn({ state }) {
      // Skip the browser entirely : schedule a self-emitted deep-link
      // so the welcome flow can be driven end-to-end without leaving
      // the desktop window.
      setTimeout(() => {
        deepLink$.next({
          token: `fake-token.${crypto.randomUUID()}`,
          state,
        });
      }, 1000);
    },
    async getCallbackPort() {
      // No real server in the fake adapter ; tests / sandbox don't
      // exercise the HTTP path, the fake openSignIn synthesizes a
      // deep-link directly. Returning 0 signals "no HTTP transport".
      return 0;
    },
    deepLink$: deepLink$.asObservable(),
  };
}
