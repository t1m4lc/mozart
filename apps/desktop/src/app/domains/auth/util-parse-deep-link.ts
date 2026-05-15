import type { DeepLinkPayload } from './data/auth.model';

// Pure helper. Parses `mozart://auth?token=...&state=...` into the
// typed payload. Returns `null` for any malformed input — wrong scheme,
// wrong endpoint, missing query params. The `state` match against the
// pending nonce is the facade's responsibility, not this helper's.
//
// Custom URL schemes don't always surface `auth` as `host` ; some
// platforms place it on `hostname`, others on `pathname`. We handle
// all three so the parser is platform-agnostic.
export function parseDeepLink(url: string): DeepLinkPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'mozart:') return null;

  const firstPathSegment = parsed.pathname.replace(/^\/+/, '').split('/')[0];
  const endpoint = parsed.host || parsed.hostname || firstPathSegment;
  if (endpoint !== 'auth') return null;

  const token = parsed.searchParams.get('token');
  const state = parsed.searchParams.get('state');
  if (!token || !state) return null;

  return { token, state };
}
