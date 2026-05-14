import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

// Tracks whether the desktop window currently has focus + is visible.
// The chat facade reads `isWindowFocused()` when an agent turn ends —
// if it's false, the user is off-screen and we surface a notification.

@Injectable({ providedIn: 'root' })
export class WindowFocusService {
  private readonly _focused = signal<boolean>(initialFocus());
  readonly isWindowFocused: Signal<boolean> = this._focused.asReadonly();

  constructor() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const onVisibility = () => this._focused.set(!document.hidden);
    const onFocus = () => this._focused.set(true);
    const onBlur = () => this._focused.set(false);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    });
  }
}

function initialFocus(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.hidden;
}
