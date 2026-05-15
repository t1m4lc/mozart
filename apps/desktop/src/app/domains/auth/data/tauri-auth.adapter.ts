import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Observable, ReplaySubject } from 'rxjs';
import { commands, events } from '../../../core/_bindings';
import { parseDeepLink } from '../util-parse-deep-link';
import type { AuthAdapter } from './auth.adapter';
import { sessionFromDto, sessionToDto } from './auth.dto';
import type { DeepLinkPayload } from './auth.model';

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
      const url = event.payload.url;
      console.info('[auth] deepLinkReceived event arrived:', url);
      const payload = parseDeepLink(url);
      if (payload) {
        console.info('[auth] parsed deep-link, state=', payload.state);
        deepLink$.next(payload);
      } else {
        console.warn('[auth] received unparsable deep-link:', url);
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
    async openSignIn({ url, state }) {
      // Atom 5 makes the apps/web /login route real ; until then this
      // 404s in the browser but proves the shell-open round-trip
      // works. The user can copy the state back into a manual
      // `xdg-open "mozart://auth?token=demo&state=..."` to complete
      // the test loop in Atom 4.
      console.info('[auth] openSignIn — opening', url);
      console.info(
        `[auth] openSignIn — fire callback manually : mozart://auth?token=demo&state=${state}`,
      );
      try {
        await openExternal(url);
      } catch (err) {
        console.error('[auth] shell.open failed:', err);
        throw err;
      }
    },
    deepLink$: deepLink$.asObservable() as Observable<DeepLinkPayload>,
  };
}
