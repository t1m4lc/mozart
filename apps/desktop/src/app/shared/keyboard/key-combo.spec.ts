import { describe, expect, it } from 'vitest';
import { matchesEvent, normalizeKey, resolvePlatform } from './key-combo';

describe('normalizeKey', () => {
  it('treats "ctrl+k" and "cmd+k" as the same combo via "mod"', () => {
    expect(normalizeKey('ctrl+k')).toEqual({
      mod: true,
      shift: false,
      alt: false,
      key: 'k',
    });
    expect(normalizeKey('cmd+k')).toEqual({
      mod: true,
      shift: false,
      alt: false,
      key: 'k',
    });
    expect(normalizeKey('mod+k')).toEqual({
      mod: true,
      shift: false,
      alt: false,
      key: 'k',
    });
  });

  it('parses single-char keys without modifiers', () => {
    expect(normalizeKey('escape')).toEqual({
      mod: false,
      shift: false,
      alt: false,
      key: 'escape',
    });
    expect(normalizeKey('Enter')).toEqual({
      mod: false,
      shift: false,
      alt: false,
      key: 'enter',
    });
  });

  it('parses shift+alt modifiers', () => {
    expect(normalizeKey('shift+alt+f')).toEqual({
      mod: false,
      shift: true,
      alt: true,
      key: 'f',
    });
  });

  it('is case-insensitive on the modifier names', () => {
    expect(normalizeKey('CTRL+Shift+ArrowUp')).toEqual({
      mod: true,
      shift: true,
      alt: false,
      key: 'arrowup',
    });
  });

  it('treats "meta" as a mod alias', () => {
    expect(normalizeKey('meta+k')).toEqual({
      mod: true,
      shift: false,
      alt: false,
      key: 'k',
    });
  });

  it('throws on an empty combo', () => {
    expect(() => normalizeKey('')).toThrow();
  });

  it('throws when no non-modifier key is provided', () => {
    expect(() => normalizeKey('ctrl+shift')).toThrow();
  });
});

describe('resolvePlatform', () => {
  it('returns "mac" when navigator.platform looks Mac-shaped', () => {
    const w = {
      navigator: { platform: 'MacIntel', userAgent: 'Mozilla' },
    } as unknown as Window;
    expect(resolvePlatform(w)).toBe('mac');
  });

  it('returns "other" on a Linux platform string', () => {
    const w = {
      navigator: { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 X11' },
    } as unknown as Window;
    expect(resolvePlatform(w)).toBe('other');
  });

  it('returns "other" when the window reference is null', () => {
    expect(resolvePlatform(null)).toBe('other');
  });

  it('falls back to userAgent when platform is empty', () => {
    const w = {
      navigator: {
        platform: '',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    } as unknown as Window;
    expect(resolvePlatform(w)).toBe('mac');
  });
});

describe('matchesEvent', () => {
  it('matches Ctrl+K on non-mac platform', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesEvent(normalizeKey('ctrl+k'), ev, 'other')).toBe(true);
  });

  it('treats Cmd+K (Meta) as mod on mac', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesEvent(normalizeKey('cmd+k'), ev, 'mac')).toBe(true);
  });

  it('does NOT match Ctrl+K on mac when the combo says cmd', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesEvent(normalizeKey('cmd+k'), ev, 'mac')).toBe(false);
  });

  it('does NOT match Cmd+K on linux when the combo says ctrl', () => {
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesEvent(normalizeKey('ctrl+k'), ev, 'other')).toBe(false);
  });

  it('requires every declared modifier to be pressed', () => {
    const combo = normalizeKey('shift+alt+f');
    const ok = new KeyboardEvent('keydown', {
      key: 'f',
      shiftKey: true,
      altKey: true,
    });
    expect(matchesEvent(combo, ok, 'other')).toBe(true);

    const missingShift = new KeyboardEvent('keydown', {
      key: 'f',
      altKey: true,
    });
    expect(matchesEvent(combo, missingShift, 'other')).toBe(false);
  });

  it('rejects extra modifiers that the combo does not declare', () => {
    const combo = normalizeKey('k');
    const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(matchesEvent(combo, ev, 'other')).toBe(false);
  });

  it('matches escape with no modifiers', () => {
    const combo = normalizeKey('escape');
    const ev = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(matchesEvent(combo, ev, 'other')).toBe(true);
  });

  it('is case-insensitive on the event key', () => {
    const combo = normalizeKey('k');
    const ev = new KeyboardEvent('keydown', { key: 'K' });
    expect(matchesEvent(combo, ev, 'other')).toBe(true);
  });
});
