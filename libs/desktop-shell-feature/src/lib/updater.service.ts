import { Injectable, signal } from '@angular/core';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

// Boot-time auto-update check. The Rust updater plugin (configured in
// tauri.conf.json -> plugins.updater) hits the GitHub Releases
// `latest.json` manifest, downloads + verifies the signed bundle
// matching the user's platform, and resolves the `check()` promise
// with an Update handle.
//
// UX: silent download in the background, then expose a signal the
// shell consumes to render a "Restart to install" banner. The user
// chooses when to restart — never forced.

export type UpdateReady = {
  version: string;
  notes?: string;
};

@Injectable({ providedIn: 'root' })
export class UpdaterService {
  readonly updateReady = signal<UpdateReady | null>(null);
  readonly currentVersion = signal<string>('');

  constructor() {
    void getVersion().then((v) => this.currentVersion.set(v));
  }

  async checkOnBoot(): Promise<void> {
    try {
      const update = await check();
      if (!update) return;
      // Download + install runs to completion before the banner shows
      // so the Restart click is a no-wait operation.
      await update.downloadAndInstall();
      this.updateReady.set({
        version: update.version,
        notes: update.body ?? undefined,
      });
    } catch (err) {
      // Updater failures are non-fatal — the user keeps using the
      // current version. Log for diagnosis without surfacing to the UI
      // (a broken updater shouldn't poison the shell).
      console.warn('[updater] check failed', err);
    }
  }

  async restart(): Promise<void> {
    await relaunch();
  }
}
