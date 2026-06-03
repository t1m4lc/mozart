import { Injectable, computed, inject, signal } from '@angular/core';
import { InjectionToken } from '@angular/core';

// Port for persisting the composer's enabled-model preference. The Tauri
// impl (global settings.json `agent.enabledModelIds`) is bound in
// app composition; kept abstract so this data-access lib stays Tauri-free.
export interface ComposerModelsPort {
  load(): Promise<readonly string[]>;
  save(ids: readonly string[]): Promise<void>;
}

export const COMPOSER_MODELS_PORT = new InjectionToken<ComposerModelsPort>(
  'COMPOSER_MODELS_PORT',
);

/**
 * Single source of truth for which models the user has enabled in the
 * composer. Shared by the Settings picker (writes) and the composer (reads)
 * so a toggle reflects live and persists. Empty ⇒ "all runnable models"
 * (the catalog default) — interpreted by `composerModels()` at the read
 * site, not here.
 */
@Injectable({ providedIn: 'root' })
export class ComposerModelsStore {
  // Optional so unit tests / non-Tauri contexts work without a backend.
  private readonly port = inject(COMPOSER_MODELS_PORT, { optional: true });

  private readonly _enabledIds = signal<readonly string[]>([]);
  readonly enabledIds = computed(() => this._enabledIds());

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.port) return;
    try {
      this._enabledIds.set(await this.port.load());
    } catch (err) {
      console.warn('[composer-models] load failed:', err);
    }
  }

  async setEnabled(ids: readonly string[]): Promise<void> {
    // No-op when the set is unchanged. The Brn multi-select can re-emit
    // `valueChange` whenever its `[value]` array reference changes (including
    // an echo right after we set it), so without this guard a fresh-array
    // write here would churn the signal forever — an infinite change-detection
    // loop that freezes the webview.
    const next = [...ids];
    if (sameSet(next, this._enabledIds())) return;
    this._enabledIds.set(next);
    if (!this.port) return;
    try {
      await this.port.save(next);
    } catch (err) {
      console.warn('[composer-models] save failed:', err);
    }
  }
}

/** Order-independent equality for two id lists. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}
