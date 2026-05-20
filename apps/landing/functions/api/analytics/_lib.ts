/**
 * Shared helpers for the analytics Cloudflare Pages Functions.
 * Pure functions only — no IO, no globals. Kept inline rather than imported
 * from the Angular app because CF Pages builds functions independently.
 */

/**
 * Minimal local stand-in for `@cloudflare/workers-types`' `PagesFunction`
 * context. Avoids adding a dev dep just for type annotations.
 */
export type PagesContext<Env = Record<string, never>> = {
  readonly request: Request;
  readonly env: Env;
};

export const INTERNAL_DEVICE_COOKIE = 'mozart_internal_device';
/** 1 year in seconds, renewed on every successful set. */
export const INTERNAL_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isInternalCookiePresent(
  cookieHeader: string,
  name: string,
): boolean {
  if (!cookieHeader) return false;
  const prefix = `${name}=`;
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith(prefix) && part.length > prefix.length);
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type SetCookieOptions = {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly secure: boolean;
  readonly domain?: string;
};

export function buildSetCookie(opts: SetCookieOptions): string {
  const parts = [
    `${opts.name}=${opts.value}`,
    'Path=/',
    `Max-Age=${opts.maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure) parts.push('Secure');
  // HttpOnly intentionally omitted so the client CookieService can read it
  // as a sync fallback when the /is-internal-device fetch is in flight.
  return parts.join('; ');
}
