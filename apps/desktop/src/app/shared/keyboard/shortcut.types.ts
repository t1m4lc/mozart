/**
 * Public type surface for `ShortcutService` and `[mzShortcut]`.
 *
 * `AllowIn` is a const-object enum (no TS `enum` keyword — Mozart
 * conventions ban TS enums in favour of literal unions). It carries the
 * native `tagName` strings so `event.target.tagName as AllowIn` lines
 * up without a separate mapping table.
 */

export const AllowIn = {
  Textarea: 'TEXTAREA',
  Input: 'INPUT',
  Select: 'SELECT',
} as const;
export type AllowIn = (typeof AllowIn)[keyof typeof AllowIn];

/**
 * Payload delivered to a `Shortcut.command` callback (or emitted by
 * `register$`).
 */
export interface ShortcutEventOutput {
  readonly event: KeyboardEvent;
  readonly key: string | readonly string[];
}

/**
 * Base shortcut definition shared between `register()` / `register$()`.
 */
export interface Shortcut {
  /**
   * Key combo. Examples: `'ctrl+k'`, `['ctrl+k', 'cmd+k']`, `'escape'`.
   * `'all'` matches every keydown (command-palette priming only).
   */
  readonly key: string | readonly string[] | 'all';
  /** Invoked on each matching keydown. */
  readonly command: (event: ShortcutEventOutput) => void;
  /** Human-readable description for in-app shortcut listings. */
  readonly description?: string;
  /** Throttle in ms — defaults to `0` (no throttling). */
  readonly throttleTime?: number;
  /** Short label, e.g. `'⌘K'`. */
  readonly label?: string;
  /** Call `preventDefault()` on matched events. Defaults to `false`. */
  readonly preventDefault?: boolean;
}

/**
 * Extended shape accepted by `register()` / `register$()`. Adds
 * focus-scope controls (`allowIn`, `target`) that the directive sets
 * for its host element.
 */
export interface ShortcutInput extends Shortcut {
  /**
   * Allow firing while focus is inside these node types. Defaults to
   * empty — i.e. block in all inputs/textareas/selects.
   */
  readonly allowIn?: readonly AllowIn[];
  /**
   * Scope to a specific element. Defaults to `document`.
   */
  readonly target?: HTMLElement;
}

/**
 * Output of `normalizeKey('ctrl+k')` — the canonical combo descriptor
 * used by `matchesEvent`.
 */
export interface KeyCombo {
  /** Cross-platform modifier: `ctrl` on non-mac, `cmd` (Meta) on mac. */
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /** The lowercase non-modifier key, e.g. `'k'`, `'escape'`, `'arrowup'`. */
  readonly key: string;
}

export type Platform = 'mac' | 'other';
