import { Injectable } from '@angular/core';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';

// Tauri-bound impl of the abstract `ExternalLinkService` declared in
// `desktop-core-data-access`. Bound via
// `{ provide: ExternalLinkService, useExisting: TauriExternalLinkService }`
// in app.config so libs can `inject(ExternalLinkService)` without
// dragging `@tauri-apps/*` into their build graph.
@Injectable({ providedIn: 'root' })
export class TauriExternalLinkService extends ExternalLinkService {
  async openExternal(url: string): Promise<void> {
    try {
      await openExternal(url);
    } catch (err) {
      console.warn('[external-link] open failed:', err);
      throw err;
    }
  }
}
