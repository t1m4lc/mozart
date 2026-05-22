// Pure helper. Builds the apps/web sign-in URL the desktop opens via
// `tauri-plugin-shell`.
//
// Two pieces of state travel through the URL :
//
//   1. `state` — the OAuth nonce (64-char hex). The apps/web side
//      ingests it on /login, persists in localStorage, and replays it
//      into the callback so the desktop facade can validate the
//      round-trip.
//
//   2. `port` — the localhost port of the desktop's HTTP callback
//      server. apps/web's `Launch Mozart desktop` button uses this to
//      `fetch(http://127.0.0.1:<port>/auth?token=…&state=…)` directly.
//      This is the primary transport — the `mozart://` scheme handoff
//      is unreliable from browsers on Linux (Chrome / Firefox silently
//      drop the launch). Pass `0` only in the rare bind-failed boot
//      path — apps/web will surface "Mozart isn't running" UI.
//
// HTTPS dev URL is kept for historical reasons (apps/web project.json
// `ssl: true`) ; the fetch from HTTPS origin to HTTP loopback is
// explicitly allowed by browsers (loopback is "potentially trustworthy"
// per W3C Secure Contexts) so there is no functional reason to switch.
//
// Capability scope in `capabilities/default.json` allow-lists
// `https://localhost:4201/**` and `https://app.mozart.build/**`.

const WEB_BASE_URL = 'https://localhost:4201';

export function buildSignInUrl(state: string, port: number): string {
  const url = new URL(`${WEB_BASE_URL}/login`);
  url.searchParams.set('state', state);
  url.searchParams.set('port', port.toString());
  return url.toString();
}
