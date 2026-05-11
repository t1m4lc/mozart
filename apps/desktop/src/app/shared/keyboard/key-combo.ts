/**
 * Pure helpers for keyboard combo parsing + cross-platform matching.
 *
 * The "mod" abstraction collapses `Ctrl` (non-mac) and `Cmd` / Meta
 * (mac) into a single virtual modifier so consumers can declare
 * `'ctrl+k'`, `'cmd+k'`, or `'mod+k'` interchangeably and the runtime
 * picks the right physical key per platform.
 */

import type { KeyCombo, Platform } from './shortcut.types';

const MOD_TOKENS = new Set(['mod', 'ctrl', 'control', 'cmd', 'command', 'meta']);
const SHIFT_TOKENS = new Set(['shift']);
const ALT_TOKENS = new Set(['alt', 'option']);

/**
 * Parse `'ctrl+k'`, `'cmd+shift+ArrowUp'`, `'escape'` etc. into a
 * canonical `KeyCombo`.
 *
 * - Modifier names are case-insensitive (`Ctrl`, `cTRL`, `CTRL` all OK).
 * - The non-modifier key is normalised to lowercase (so a `KeyboardEvent`
 *   firing `'K'` and a combo declaring `'k'` agree).
 * - Throws if the combo has no non-modifier key (e.g. `'ctrl+shift'`).
 */
export function normalizeKey(combo: string): KeyCombo {
  if (!combo || !combo.trim()) {
    throw new Error('normalizeKey: combo string must not be empty');
  }
  let mod = false;
  let shift = false;
  let alt = false;
  let key: string | undefined;

  for (const raw of combo.split('+')) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (MOD_TOKENS.has(token)) {
      mod = true;
    } else if (SHIFT_TOKENS.has(token)) {
      shift = true;
    } else if (ALT_TOKENS.has(token)) {
      alt = true;
    } else {
      key = token;
    }
  }

  if (key === undefined) {
    throw new Error(`normalizeKey: no non-modifier key in combo "${combo}"`);
  }
  return { mod, shift, alt, key };
}

/**
 * Decide whether the host platform should treat Cmd (Meta) as "mod"
 * (mac) or Ctrl (everything else). Reads `navigator.platform` first
 * and falls back to `navigator.userAgent` when platform is empty.
 *
 * Accepts a possibly-`null` Window so callers can pass
 * `document.defaultView` directly (e.g. when running outside a browser
 * during SSR / Vitest tests).
 */
export function resolvePlatform(win: Window | null | undefined): Platform {
  if (!win || !win.navigator) return 'other';
  const platform = win.navigator.platform ?? '';
  if (/Mac|iPhone|iPod|iPad/i.test(platform)) return 'mac';
  const ua = win.navigator.userAgent ?? '';
  if (!platform && /Mac|iPhone|iPod|iPad|Macintosh/i.test(ua)) return 'mac';
  return 'other';
}

/**
 * Does this `KeyboardEvent` satisfy the declared `KeyCombo` on the
 * given platform? The "mod" virtual modifier maps to `metaKey` on mac
 * and `ctrlKey` everywhere else. Extra modifiers held down that the
 * combo did NOT declare disqualify the match (so `'k'` won't fire on
 * Ctrl+K).
 */
export function matchesEvent(
  combo: KeyCombo,
  event: KeyboardEvent,
  platform: Platform,
): boolean {
  const wantMod = combo.mod;
  const haveMod = platform === 'mac' ? event.metaKey : event.ctrlKey;
  if (wantMod !== haveMod) return false;

  if (combo.shift !== event.shiftKey) return false;
  if (combo.alt !== event.altKey) return false;

  // On non-mac, a pressed metaKey isn't a "mod" but also shouldn't
  // sneak through as an extra modifier when the combo declared none.
  if (platform !== 'mac' && event.metaKey && !combo.mod) return false;
  // Symmetrically for mac + ctrlKey.
  if (platform === 'mac' && event.ctrlKey && !combo.mod) return false;

  const eventKey = (event.key ?? '').toLowerCase();
  return eventKey === combo.key;
}
