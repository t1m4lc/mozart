import { describe, expect, it } from 'vitest';
import { contextGaugeColorClass, contextGaugePct } from './mz-context-gauge';

describe('contextGaugePct', () => {
  it('returns the clamped fraction', () => {
    expect(contextGaugePct(50_000, 200_000)).toBe(0.25);
  });

  it('clamps above 1 and below 0', () => {
    expect(contextGaugePct(250_000, 200_000)).toBe(1);
    expect(contextGaugePct(-10, 200_000)).toBe(0);
  });

  it('returns 0 for a non-positive max', () => {
    expect(contextGaugePct(100, 0)).toBe(0);
  });
});

describe('contextGaugeColorClass — thresholds', () => {
  it('neutral below 70%', () => {
    expect(contextGaugeColorClass(0.69)).toBe('text-muted-foreground');
  });

  it('amber at/above 70%', () => {
    expect(contextGaugeColorClass(0.7)).toBe('text-amber-500');
    expect(contextGaugeColorClass(0.89)).toBe('text-amber-500');
  });

  it('red at/above 90%', () => {
    expect(contextGaugeColorClass(0.9)).toBe('text-destructive');
    expect(contextGaugeColorClass(1)).toBe('text-destructive');
  });
});
