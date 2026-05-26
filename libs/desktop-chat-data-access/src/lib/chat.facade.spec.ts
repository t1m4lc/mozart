import { describe, expect, it } from 'vitest';
import { decideTurnEndNotification } from './chat.facade';

// `decideTurnEndNotification` is the only pure piece of the
// turn-end notification path. The wider integration (run lifecycle
// → `_maybeNotifyTurnEnd` → `NotificationService.notify`) is
// dependency-heavy and is covered manually + via the desktop e2e
// smoke; what this spec locks in is the trigger condition itself —
// "popup only when the user isn't here" — so a future tweak to the
// gate doesn't regress silently.

describe('decideTurnEndNotification', () => {
  it('returns popup-and-sound when the user is on a different workspace', () => {
    expect(
      decideTurnEndNotification({ focused: true, isActiveWorkspace: false }),
    ).toBe('popup-and-sound');
  });

  it('returns popup-and-sound when the window is unfocused', () => {
    expect(
      decideTurnEndNotification({ focused: false, isActiveWorkspace: true }),
    ).toBe('popup-and-sound');
  });

  it('returns popup-and-sound when the window is unfocused AND on a different workspace', () => {
    expect(
      decideTurnEndNotification({ focused: false, isActiveWorkspace: false }),
    ).toBe('popup-and-sound');
  });

  it('returns sound-only when the user is focused on this workspace (no double-popup)', () => {
    expect(
      decideTurnEndNotification({ focused: true, isActiveWorkspace: true }),
    ).toBe('sound-only');
  });
});
