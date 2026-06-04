export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
export const INTERNAL_DEVICE_COOKIE = 'mozart_internal_device';
export const INTERNAL_DEVICE_TOKEN_PARAM = 'internal';

export type PostHogInitConfig = {
  readonly api_host: string;
  readonly cross_subdomain_cookie: true;
  readonly persistence: 'localStorage+cookie';
  readonly capture_pageview: 'history_change';
  readonly capture_pageleave: false;
  readonly autocapture: false;
  readonly capture_performance: false;
  readonly disable_session_recording: true;
  readonly request_batching: false;
  // Desktop seeds the anonymous distinct_id with its persistent install_id
  // so a later identify(userId) merges the install into the same person.
  readonly bootstrap?: { readonly distinctID: string };
};

/** Returns the API key when non-empty, null when disabled. */
export function resolvePostHogKey(key: string): string | null {
  return key.length > 0 ? key : null;
}

export function buildPostHogConfig(
  host: string,
  bootstrapDistinctId?: string,
): PostHogInitConfig {
  return {
    api_host: host.length > 0 ? host : DEFAULT_POSTHOG_HOST,
    cross_subdomain_cookie: true,
    persistence: 'localStorage+cookie',
    capture_pageview: 'history_change',
    capture_pageleave: false,
    autocapture: false,
    capture_performance: false,
    disable_session_recording: true,
    request_batching: false,
    ...(bootstrapDistinctId
      ? { bootstrap: { distinctID: bootstrapDistinctId } }
      : {}),
  };
}

/** Extracts the `?internal=…` query value from a full URL. Null when absent. */
export function readInternalTokenFromUrl(url: string): string | null {
  try {
    const v = new URL(url).searchParams.get(INTERNAL_DEVICE_TOKEN_PARAM);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
