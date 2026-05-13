import { InjectionToken } from '@angular/core';

// Wraps the native folder picker. Concrete impl bound in app.config.ts
// (Tauri-backed via @tauri-apps/plugin-dialog). Returns the picked path
// or null if the user cancelled.
export interface DialogAdapter {
  pickFolder(opts?: { defaultPath?: string }): Promise<string | null>;
}

export const DIALOG_ADAPTER = new InjectionToken<DialogAdapter>(
  'DIALOG_ADAPTER',
);
