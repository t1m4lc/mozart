import { PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimelinePrefsService } from './timeline-prefs.service';

const STORAGE_KEY = 'mozart-timeline-density-v1';

function makeService(platform: 'browser' | 'server' = 'browser'): TimelinePrefsService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      ...(platform === 'server'
        ? [{ provide: PLATFORM_ID, useValue: 'server' }]
        : []),
    ],
  });
  return TestBed.inject(TimelinePrefsService);
}

describe('TimelinePrefsService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('defaults to "normal" when localStorage is empty', () => {
    const service = makeService();
    expect(service.density()).toBe('normal');
  });

  it('reads a previously persisted value at construction', () => {
    localStorage.setItem(STORAGE_KEY, 'detailed');
    const service = makeService();
    expect(service.density()).toBe('detailed');
  });

  it('falls back to "normal" if the stored value is garbage', () => {
    localStorage.setItem(STORAGE_KEY, 'verbose-extreme');
    const service = makeService();
    expect(service.density()).toBe('normal');
  });

  it('setDensity updates the signal and persists', () => {
    const service = makeService();
    service.setDensity('compact');
    expect(service.density()).toBe('compact');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
  });

  it('does not throw on the server (SSR) and stays at default', () => {
    const service = makeService('server');
    expect(() => service.setDensity('detailed')).not.toThrow();
    // In-memory signal still updates ; persistence is a no-op.
    expect(service.density()).toBe('detailed');
  });
});
