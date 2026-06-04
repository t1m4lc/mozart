import { Injectable } from '@angular/core';
import { AnalyticsConfigPort } from '@mozart/desktop-core-data-access';

import { commands } from './_bindings';

/**
 * Tauri-bound impl of the abstract `AnalyticsConfigPort`. Reads/writes the
 * `install_id` and `telemetry_opt_in` keys in the Rust config KV table.
 * Bound to the abstract via `{ useExisting: TauriAnalyticsConfig }` in
 * app.config.
 */
@Injectable({ providedIn: 'root' })
export class TauriAnalyticsConfig extends AnalyticsConfigPort {
  override async getOrCreateInstallId(): Promise<string> {
    const res = await commands.getOrCreateInstallId();
    if (res.status === 'ok') return res.data;
    throw res.error;
  }

  override async getTelemetryOptIn(): Promise<boolean> {
    const res = await commands.getTelemetryOptIn();
    // Fail open to the beta default if the command errors — never silently
    // disable collection because of a transient read failure.
    return res.status === 'ok' ? res.data : true;
  }

  override async setTelemetryOptIn(value: boolean): Promise<void> {
    const res = await commands.setTelemetryOptIn(value);
    if (res.status === 'error') throw res.error;
  }
}
