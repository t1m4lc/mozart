import { Injectable, computed, signal } from '@angular/core';

// Central feature-flag registry. The whole app reads through
// FeatureFlagsService below — never imports FEATURE_FLAGS directly —
// so the next iteration (DB-backed per-user overrides, /settings Labs
// toggles, remote-config kill switches) can drop in without touching
// any consumer.
//
// v0.0.1 contract :
//   - Flags are compile-time constants
//   - The service exposes them as signals so templates / computeds /
//     effects can react to them just like any other state
//   - setFlag() exists for devtools / debug sessions, but no UI wires
//     to it yet
//
// Adding a flag :
//   1. Add the field to FeatureFlags
//   2. Add the default to FEATURE_FLAGS
//   3. Add the per-flag computed accessor on FeatureFlagsService
//   4. Gate the consumer with `@defer (when flags.foo())`
//
// Gating pattern — both HIDE and CODE-SPLIT in one expression :
//
//   @defer (when flags.foo()) {
//     <app-foo />
//   } @placeholder {
//     <!-- nothing — feature lives behind the flag -->
//   }
//
// Angular auto-detects components used only inside @defer and emits
// them in their own chunk. Flag = false → chunk never loads. Flag
// flipped to true → chunk fetches on the first truthy read. Prefer
// this over a bare @if when the gated feature is non-trivial JS — it
// keeps the disabled code out of the main bundle entirely.

export interface FeatureFlags {
  /** When false, every chat surface is hidden : the sidebar Chats
   *  group, the per-workspace tab bar, the composer + message list,
   *  the chat-empty-state inside the workspace detail page, and the
   *  composer step of the onboarding tour. The chat domain still
   *  hydrates and runs in the background — re-enabling is a one-flip
   *  change with no rebuild needed. */
  readonly chat: boolean;
}

export const FEATURE_FLAGS: FeatureFlags = {
  chat: false,
} as const;

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly _flags = signal<FeatureFlags>({ ...FEATURE_FLAGS });

  readonly flags = this._flags.asReadonly();

  // Per-flag accessors. One computed per flag keeps consumers narrow —
  // a component that reads `chat()` only re-runs when the chat flag
  // changes, not when any other flag flips.
  readonly chat = computed(() => this._flags().chat);

  /** Override a single flag in-memory. Persists nothing — the next
   *  reload resets to FEATURE_FLAGS. Useful for devtools and for the
   *  future Settings → Labs surface that hasn't shipped yet. */
  setFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
    this._flags.update((current) => ({ ...current, [key]: value }));
  }
}
