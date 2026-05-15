import { appLocalDataDir, join } from '@tauri-apps/api/path';
import {
  Stronghold,
  type Client,
  type Store,
} from '@tauri-apps/plugin-stronghold';
import { Observable, ReplaySubject } from 'rxjs';
import { events } from '../../../core/_bindings';
import { parseDeepLink } from '../util-parse-deep-link';
import type { AuthAdapter } from './auth.adapter';
import {
  sessionFromDto,
  sessionToDto,
  type AuthSessionDto,
} from './auth.dto';
import type { DeepLinkPayload } from './auth.model';

// Tauri-backed AuthAdapter.
//
// Atom 3 scope :
//   - deepLink$ : real (sourced from `events.deepLinkReceived`)
//   - session storage : REAL — Stronghold-backed snapshot persisted to
//     `appLocalDataDir/mozart-auth.stronghold`. Vault key derived from
//     a baked salt + the per-install data-dir path (Rust-side sha256
//     finalizes the 32-byte key — see `lib.rs`).
//   - openSignIn : still logs (Atom 4 wires `shell.open`).
//
// First launch behavior : `Stronghold.load` creates a fresh instance
// when the snapshot file is absent ; `loadClient` then throws so we
// fall back to `createClient`. `store.get` returns null until the
// first `saveSession`. Wrong-password (e.g. cross-user copy of the
// binary) surfaces as a load error ; we swallow it in `loadSession`
// and return null so the user lands on /welcome and re-authenticates.

const STRONGHOLD_FILENAME = 'mozart-auth.stronghold';
const CLIENT_NAME = 'mozart-auth';
const SESSION_KEY = 'session';
// Baked salt prefix combined with the per-install data-dir path to
// derive the vault password. The Rust hash function in `lib.rs` then
// sha256s it to produce the 32-byte key. Not perfect security (the
// binary contains the salt) — but per-install : the same binary on a
// different machine cannot decrypt the snapshot.
const VAULT_PASSWORD_SALT = 'mozart://auth/v0.0.1/x9k2';

export function tauriAuthAdapter(): AuthAdapter {
  console.info('[auth] tauriAuthAdapter() factory invoked');

  // ReplaySubject(1) buffers the latest deep-link emission so the
  // facade's subscriber, attached after `bootstrap()` resolves (which
  // awaits Stronghold init), still receives a deep-link that arrived
  // during that window. Without this, an unlucky cold-launch where
  // the OS forwards the URL faster than Stronghold loads would drop
  // the event silently.
  const deepLink$ = new ReplaySubject<DeepLinkPayload>(1);

  let stronghold: Stronghold | null = null;
  let storePromise: Promise<Store> | null = null;

  function ensureStore(): Promise<Store> {
    if (!storePromise) {
      const fresh = (async () => {
        const dataDir = await appLocalDataDir();
        const snapshotPath = await join(dataDir, STRONGHOLD_FILENAME);
        const password = `${VAULT_PASSWORD_SALT}|${dataDir}`;
        console.info('[auth] ensureStore — loading Stronghold at', snapshotPath);

        // Same timeout-guard pattern as `save()` : tauri-plugin-
        // stronghold@2.3.1 can leave `Stronghold.load`'s IPC ack
        // dangling on Linux even though the snapshot is read on the
        // Rust side. 10 s is generous — first-launch decryption +
        // actor-system spin-up takes <1s on a sane system.
        const TIMEOUT_MS = 10_000;
        stronghold = await Promise.race([
          Stronghold.load(snapshotPath, password),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(new Error(`Stronghold.load timed out after ${TIMEOUT_MS}ms`)),
              TIMEOUT_MS,
            ),
          ),
        ]);
        console.info('[auth] ensureStore — Stronghold.load() resolved');
        let client: Client;
        try {
          client = await stronghold.loadClient(CLIENT_NAME);
          console.info('[auth] ensureStore — loaded existing client');
        } catch {
          client = await stronghold.createClient(CLIENT_NAME);
          console.info('[auth] ensureStore — created new client');
        }
        return client.getStore();
      })();
      storePromise = fresh;
      // Allow retry on the next call if the init rejects (e.g. load
      // timeout) — otherwise a single failure would lock the adapter
      // out for the lifetime of the app.
      fresh.catch(() => {
        if (storePromise === fresh) {
          storePromise = null;
          stronghold = null;
        }
      });
    }
    return storePromise;
  }

  // Workaround for tauri-plugin-stronghold@2.3.1 : `Stronghold.save()`
  // writes the snapshot to disk but its IPC response back to JS hangs
  // indefinitely on Linux (verified : the file is updated even though
  // the await never resolves). Race the save against a 1.5 s timeout
  // so the auth flow can progress. The disk write IS happening — we
  // are only abandoning the round-trip ack. Documented as a v0.0.1
  // limitation ; track upstream fix + remove the timeout post-MVP.
  async function saveWithTimeout(s: Stronghold): Promise<void> {
    const TIMEOUT_MS = 1500;
    let timedOut = false;
    await Promise.race([
      s.save(),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, TIMEOUT_MS);
      }),
    ]);
    if (timedOut) {
      console.warn(
        '[auth] Stronghold.save() did not ack within',
        TIMEOUT_MS,
        'ms — assuming write succeeded (known plugin bug)',
      );
    }
  }

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
      console.error('[auth] failed to register deepLinkReceived listener:', err),
    );

  return {
    async loadSession() {
      try {
        const store = await ensureStore();
        const bytes = await store.get(SESSION_KEY);
        if (!bytes || bytes.length === 0) {
          console.info('[auth] loadSession — no session in vault');
          return null;
        }
        const json = new TextDecoder().decode(bytes);
        const dto = JSON.parse(json) as AuthSessionDto;
        console.info('[auth] loadSession — session loaded, expiresAt=', dto.expiresAt);
        return sessionFromDto(dto);
      } catch (err) {
        console.warn('[auth] loadSession failed:', err);
        return null;
      }
    },
    async saveSession(session) {
      console.info('[auth] saveSession — persisting session');
      try {
        const dto = sessionToDto(session);
        const bytes = Array.from(
          new TextEncoder().encode(JSON.stringify(dto)),
        );
        console.info('[auth] saveSession — awaiting ensureStore');
        const store = await ensureStore();
        console.info(
          '[auth] saveSession — ensureStore returned, calling store.insert with',
          bytes.length,
          'bytes',
        );
        await store.insert(SESSION_KEY, bytes);
        console.info('[auth] saveSession — store.insert returned');
        if (stronghold) {
          console.info('[auth] saveSession — calling stronghold.save (timeout-guarded)');
          await saveWithTimeout(stronghold);
          console.info('[auth] saveSession — save complete (or timeout-bypassed)');
        } else {
          console.warn('[auth] saveSession — stronghold ref is null, save skipped');
        }
      } catch (err) {
        console.error('[auth] saveSession internal failure:', err);
        throw err;
      }
    },
    async clearSession() {
      try {
        const store = await ensureStore();
        await store.remove(SESSION_KEY);
        if (stronghold) await saveWithTimeout(stronghold);
        console.info('[auth] clearSession — done');
      } catch (err) {
        console.warn('[auth] clearSession failed:', err);
      }
    },
    async openSignIn({ state }) {
      // Atom 4 swaps this for `shell.open(url)`. Until then the user
      // fires the deep-link manually via the OS handler — see Atom 2
      // manual test in the plan.
      console.info(
        `[auth] openSignIn — fire manually : mozart://auth?token=demo&state=${state}`,
      );
    },
    deepLink$: deepLink$.asObservable() as Observable<DeepLinkPayload>,
  };
}
