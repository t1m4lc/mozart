import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Observable, ReplaySubject } from 'rxjs';
import {
  type AuthAdapter,
  sessionFromDto,
  sessionToDto,
} from '@mozart/desktop-auth-data-access';
import { type DeepLinkPayload, parseDeepLink } from '@mozart/desktop-auth-util';
import { commands, events } from './_bindings';

// Tauri-backed AuthAdapter.
//
// Storage is OS-keyring backed via three Rust commands :
//   - auth_load_session  → Option<AuthSessionDto>
//   - auth_save_session  → ()
//   - auth_clear_session → ()
//
// This replaces the original tauri-plugin-stronghold integration : that
// plugin's IPC bridge (v2.3.1) leaves snapshot writes mid-rename on
// Linux, causing persistence to silently fail. The `keyring` crate is
// the same one used by `credentials/` for Anthropic + GitHub tokens —
// proven path, cross-OS uniform from the Rust side.
//
// Deep-link source : the `events.deepLinkReceived` typed event emitted
// by `src-tauri/src/auth/deep_link.rs`. URL parsing happens via the
// pure `parseDeepLink` helper. ReplaySubject(1) buffers the latest
// emission so the facade's subscriber (attached after `bootstrap()`)
// receives a deep-link that arrived during boot.

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

export function tauriAuthAdapter(): AuthAdapter {
  console.info('[auth] tauriAuthAdapter() factory invoked');

  const deepLink$ = new ReplaySubject<DeepLinkPayload>(1);

  void events.deepLinkReceived
    .listen((event) => {
      // Never log the raw URL : it carries the JWT and the state
      // nonce. Anti-regression check §10.6 — keep this strict.
      const payload = parseDeepLink(event.payload.url);
      if (payload) {
        console.info('[auth] deep-link received and parsed');
        deepLink$.next(payload);
      } else {
        console.warn('[auth] received unparsable deep-link');
      }
    })
    .then(() => console.info('[auth] deepLinkReceived listener registered'))
    .catch((err) =>
      console.error(
        '[auth] failed to register deepLinkReceived listener:',
        err,
      ),
    );

  return {
    async loadSession() {
      try {
        const dto = unwrap(await commands.authLoadSession());
        if (!dto) {
          console.info('[auth] loadSession — no session in keyring');
          return null;
        }
        console.info(
          '[auth] loadSession — session loaded, expires_at=',
          dto.expires_at,
        );
        return sessionFromDto(dto);
      } catch (err) {
        console.warn('[auth] loadSession failed:', err);
        return null;
      }
    },
    async saveSession(session) {
      console.info('[auth] saveSession — persisting session');
      try {
        unwrap(await commands.authSaveSession(sessionToDto(session)));
        console.info('[auth] saveSession — done');
      } catch (err) {
        console.error('[auth] saveSession failed:', err);
        throw err;
      }
    },
    async clearSession() {
      try {
        unwrap(await commands.authClearSession());
        console.info('[auth] clearSession — done');
      } catch (err) {
        console.warn('[auth] clearSession failed:', err);
      }
    },
    async markOnboardingComplete() {
      // Rust proxies this to the web backend (Clerk Backend SDK). Surfacing
      // the error lets the facade log it; the facade treats it best-effort
      // so the local mirror still completes onboarding.
      unwrap(await commands.markOnboardingComplete());
    },
    async openSignIn({ url }) {
      // The browser lands on apps/web /login which captures state +
      // port, walks the user through OAuth, then on /dashboard fires
      // a `fetch(http://127.0.0.1:<port>/auth?token=…&state=…)`. The
      // localhost callback server (Rust side) synthesizes a mozart://
      // URL and emits the same DeepLinkReceived event the OS scheme
      // handler emits — so this adapter and the facade are transport-
      // agnostic.
      //
      // For dev-loop testing without the browser, fish the state nonce
      // out of the facade signal (`AuthFacade.signInUrl()`) in
      // devtools and `curl http://127.0.0.1:<port>/auth?token=demo&
      // state=<the-state>` from a terminal.
      console.info('[auth] openSignIn — handing URL to OS browser');
      try {
        await openExternal(url);
      } catch (err) {
        console.error('[auth] shell.open failed:', err);
        throw err;
      }
    },
    async getCallbackPort() {
      try {
        const port = await commands.authGetCallbackPort();
        console.info('[auth] callback server port =', port);
        return port;
      } catch (err) {
        console.error('[auth] authGetCallbackPort failed:', err);
        return 0;
      }
    },
    deepLink$: deepLink$.asObservable() as Observable<DeepLinkPayload>,
  };
}
