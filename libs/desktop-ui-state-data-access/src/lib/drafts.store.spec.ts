import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DraftsStore } from './drafts.store';

// Drafts store — in-memory mirror with debounced localStorage write.
// Worker design dropped per browser-spec constraint (Storage isn't
// exposed to dedicated workers); debounce-with-flush is the practical
// fallback that preserves the perf goal (no per-keystroke write).

const STORAGE_KEY = 'mozart-drafts-v1';

describe('DraftsStore', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.useRealTimers();
  });

  it('read returns null for an unset (ws, path)', () => {
    const store = TestBed.inject(DraftsStore);
    expect(store.read('ws-a', 'src/a.ts')).toBeNull();
  });

  it('set + read round-trips via the in-memory mirror (synchronous)', () => {
    const store = TestBed.inject(DraftsStore);
    store.set('ws-a', 'src/a.ts', 'console.log("hi")');
    const entry = store.read('ws-a', 'src/a.ts');
    expect(entry?.content).toBe('console.log("hi")');
    expect(typeof entry?.updatedAt).toBe('number');
  });

  it('clear drops the entry', () => {
    const store = TestBed.inject(DraftsStore);
    store.set('ws-a', 'src/a.ts', 'hello');
    store.clear('ws-a', 'src/a.ts');
    expect(store.read('ws-a', 'src/a.ts')).toBeNull();
  });

  it('clear is idempotent on a missing entry', () => {
    const store = TestBed.inject(DraftsStore);
    expect(() => store.clear('ws-a', 'src/missing.ts')).not.toThrow();
  });

  it('pruneWorkspace drops all paths for the workspace', () => {
    const store = TestBed.inject(DraftsStore);
    store.set('ws-a', 'src/a.ts', 'A');
    store.set('ws-a', 'src/b.ts', 'B');
    store.set('ws-b', 'src/c.ts', 'C');

    store.pruneWorkspace('ws-a');

    expect(store.read('ws-a', 'src/a.ts')).toBeNull();
    expect(store.read('ws-a', 'src/b.ts')).toBeNull();
    expect(store.read('ws-b', 'src/c.ts')?.content).toBe('C');
  });

  it('debounces localStorage writes — multiple sets coalesce into one flush', async () => {
    vi.useFakeTimers();
    const store = TestBed.inject(DraftsStore);

    store.set('ws-a', 'src/a.ts', 'one');
    store.set('ws-a', 'src/a.ts', 'two');
    store.set('ws-a', 'src/a.ts', 'three');

    // Before the flush interval, localStorage has not been written.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(500);

    const persisted = window.localStorage.getItem(STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted as string)['ws-a']['src/a.ts'].content).toBe(
      'three',
    );
  });

  it('hydrates from localStorage on construction', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'ws-a': {
          'src/restored.ts': { content: 'persisted', updatedAt: 123 },
        },
      }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const store = TestBed.inject(DraftsStore);
    expect(store.read('ws-a', 'src/restored.ts')?.content).toBe('persisted');
  });
});
