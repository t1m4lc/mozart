import { Injectable } from '@angular/core';
import { open as openExternal } from '@tauri-apps/plugin-shell';

// Thin wrapper over `@tauri-apps/plugin-shell` so feature components
// don't import Tauri APIs directly. Lives in `core/` per the project's
// boundary rules (Tauri imports allowed under `core/` and `data/`).
@Injectable({ providedIn: 'root' })
export class ShellService {
  async openExternal(url: string): Promise<void> {
    try {
      await openExternal(url);
    } catch (err) {
      console.warn('[shell] open external failed:', err);
      throw err;
    }
  }
}
