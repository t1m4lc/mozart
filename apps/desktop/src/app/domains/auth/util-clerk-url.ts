// Pure helper. Builds the apps/web sign-in URL the desktop opens via
// `tauri-plugin-shell`. The `state` nonce travels in the query string ;
// the apps/web `/dashboard` page (Atom 5) reads it back and embeds it
// in the `mozart://auth?...&state=...` callback URL.
//
// Dev URL hardcoded for v0.0.1 — apps/web runs on port 4201 (desktop's
// own dev server owns :4200). Atom 5 wires the real routes. The
// capability scope in `capabilities/default.json` allow-lists
// `http://localhost:4201/**` and `https://app.mozart.build/**`.
// Switching dev↔prod selection will be wired alongside Atom 5 when
// apps/web actually serves something.

const WEB_BASE_URL = 'http://localhost:4201';

export function buildSignInUrl(state: string): string {
  const url = new URL(`${WEB_BASE_URL}/login`);
  url.searchParams.set('state', state);
  return url.toString();
}
