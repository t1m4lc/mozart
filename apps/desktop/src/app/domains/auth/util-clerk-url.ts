// Pure helper. Builds the apps/web sign-in URL the desktop opens via
// `tauri-plugin-shell`. The `state` nonce travels in the query string ;
// the apps/web `/dashboard` page reads it back and embeds it in the
// `mozart://auth?...&state=...` callback URL.
//
// Dev URL uses HTTPS — Chrome on Linux is markedly more permissive
// about firing custom-scheme launches (`mozart://`) from HTTPS origins
// than HTTP ones. apps/web's dev server uses Angular's auto-generated
// self-signed cert (project.json `ssl: true`). First-time browser
// users accept the cert warning once per session ; install `mkcert`
// for a permanently-trusted dev cert.
//
// Capability scope in `capabilities/default.json` allow-lists
// `https://localhost:4201/**` and `https://app.mozart.build/**`.

const WEB_BASE_URL = 'https://localhost:4201';

export function buildSignInUrl(state: string): string {
  const url = new URL(`${WEB_BASE_URL}/login`);
  url.searchParams.set('state', state);
  return url.toString();
}
