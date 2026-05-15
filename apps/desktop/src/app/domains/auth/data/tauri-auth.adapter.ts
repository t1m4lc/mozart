import { Observable, Subject } from 'rxjs';
import { events } from '../../../core/_bindings';
import { parseDeepLink } from '../util-parse-deep-link';
import type { AuthAdapter } from './auth.adapter';
import type { AuthSession, DeepLinkPayload } from './auth.model';

// Tauri-backed AuthAdapter.
//
// Atom 2 scope :
//   - deepLink$ : REAL — sourced from the `events.deepLinkReceived`
//     typed event emitted by `src-tauri/src/auth/deep_link.rs`. Parsing
//     of the `mozart://auth?...` URL into `{ token, state }` happens
//     here via the pure `parseDeepLink` helper.
//   - session storage : in-memory stub (Atom 3 replaces this with
//     `commands.auth_load_session` / `auth_save_session` /
//     `auth_clear_session` once `tauri-plugin-stronghold` is wired).
//   - openSignIn : no-op + console log (Atom 4 wires `shell.open` so
//     clicking Sign in actually opens the browser).
//
// Lifecycle : the adapter is constructed once at app boot when Angular
// injects `AUTH_ADAPTER`. The deep-link listener is registered eagerly
// in the factory and lives for the lifetime of the app — there is no
// app-level teardown in v0.0.1 (the only "destroyer" is the window
// closing, which tears Tauri down with it).
export function tauriAuthAdapter(): AuthAdapter {
  let session: AuthSession | null = null;
  const deepLink$ = new Subject<DeepLinkPayload>();

  void events.deepLinkReceived.listen((event) => {
    const url = event.payload.url;
    const payload = parseDeepLink(url);
    if (payload) {
      deepLink$.next(payload);
    } else {
      console.warn('[auth] received unparsable deep-link:', url);
    }
  });

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
      // Atom 4 swaps this for `shell.open(url)`. Until then the user
      // fires the deep-link manually via the OS handler ; logging the
      // state nonce lets them copy-paste it into the test URL :
      //
      //   xdg-open "mozart://auth?token=demo&state=<copied-state>"
      console.info(
        `[auth] openSignIn — fire manually : mozart://auth?token=demo&state=${state}`,
      );
    },
    deepLink$: deepLink$.asObservable() as Observable<DeepLinkPayload>,
  };
}
