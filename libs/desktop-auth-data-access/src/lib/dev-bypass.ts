import { isDevMode } from '@angular/core';

// Dev-only switch that short-circuits auth + onboarding guards so the
// desktop app can be exercised in a plain browser (no Tauri wrapper)
// without going through the Clerk sign-in deep-link round-trip.
//
// Activation: visit any route with `?dev=1`. The flag persists in
// localStorage across navigations until `?dev=0` clears it.
//
// Hard gate: `isDevMode()` is false in production builds, so this
// utility always returns false in prod regardless of the URL or
// localStorage state. No accidental bypass shipping.
const STORAGE_KEY = 'mozart.dev.bypass';

export function isDevAuthBypassActive(): boolean {
  if (!isDevMode()) return false;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('dev');
  if (flag === '1') {
    window.localStorage.setItem(STORAGE_KEY, '1');
    return true;
  }
  if (flag === '0') {
    window.localStorage.removeItem(STORAGE_KEY);
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

// True when the page is loaded inside the Tauri webview (vs. a plain
// browser running `pnpm nx serve desktop`). Tauri v2 sets
// `window.__TAURI_INTERNALS__` on bootstrap; we also accept the older
// `__TAURI__` global as a defensive fallback.
export function isRunningInTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return '__TAURI_INTERNALS__' in w || '__TAURI__' in w;
}

// Flip on dev-auth bypass programmatically and reload so the guards
// re-evaluate against the new localStorage state. Dev-mode only —
// no-op in production builds.
export function enableDevAuthBypassAndReload(target = '/'): void {
  if (!isDevMode()) return;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, '1');
  window.location.href = `${window.location.origin}${target}`;
}
