import { describe, expect, it } from 'vitest';
import { formatDuration, formatTokens } from './turn-footer';

describe('formatDuration', () => {
  it('shows one-decimal seconds under a minute', () => {
    expect(formatDuration(12_300)).toBe('12.3s');
    expect(formatDuration(900)).toBe('0.9s');
  });

  it('shows m + s at or above a minute', () => {
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatDuration(125_400)).toBe('2m 5s');
  });
});

describe('formatTokens', () => {
  it('passes through small counts', () => {
    expect(formatTokens(950)).toBe('950');
  });

  it('abbreviates thousands', () => {
    expect(formatTokens(4200)).toBe('4.2k');
    expect(formatTokens(200_000)).toBe('200.0k');
  });
});
