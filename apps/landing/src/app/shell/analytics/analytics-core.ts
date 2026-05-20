/**
 * Pure functions consumed by the analytics shell. No Angular, no DOM, no I/O.
 * Keeping these isolated makes them trivial to unit-test and reason about.
 */

export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
export const INTERNAL_DEVICE_COOKIE = 'mozart_internal_device';
export const INTERNAL_DEVICE_TOKEN_PARAM = 'internal';

export type PostHogEnableInput = {
  readonly key: string | undefined;
  readonly isDev: boolean;
  readonly forceEnable: string | undefined;
};

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
};

/** Returns the resolved API key (PostHog should init) or null (disabled). */
export function resolvePostHogKey(input: PostHogEnableInput): string | null {
  if (!input.key) return null;
  if (input.isDev && !input.forceEnable) return null;
  return input.key;
}

export function buildPostHogConfig(
  host: string | undefined,
): PostHogInitConfig {
  return {
    api_host: host ?? DEFAULT_POSTHOG_HOST,
    cross_subdomain_cookie: true,
    persistence: 'localStorage+cookie',
    capture_pageview: 'history_change',
    capture_pageleave: false,
    autocapture: false,
    capture_performance: false,
    disable_session_recording: true,
    request_batching: false,
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
