import { isDevMode } from '@angular/core';

// Gate for the dev-only LLM debug surfaces (envelope inspector). On in
// any dev build; in production only when the `mozart:debug` localStorage
// escape hatch is set — mirrors the console-logging gate in
// apps/desktop/src/main.ts so the two stay consistent.
export function isDevDebugViewEnabled(): boolean {
  if (isDevMode()) return true;
  try {
    return !!localStorage.getItem('mozart:debug');
  } catch {
    return false;
  }
}
