import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ScrollSurfaceRegistry,
  type ScrollSurface,
} from './scroll-surface-registry.service';

interface TestSurface {
  surface: ScrollSurface;
  atBottom: ReturnType<typeof signal<boolean>>;
}

function makeSurface(opts?: {
  isAtBottom?: boolean;
  element?: HTMLElement | null;
}): TestSurface {
  const atBottom = signal<boolean>(opts?.isAtBottom ?? true);
  const el = signal<HTMLElement | null>(opts?.element ?? null);
  const surface: ScrollSurface = {
    isAtBottom: atBottom.asReadonly(),
    element: el.asReadonly(),
    setKey: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollIntoView: vi.fn(),
    scrollTo: vi.fn(),
    snapshot: vi.fn(),
    detach: vi.fn(),
  };
  return { surface, atBottom };
}

describe('ScrollSurfaceRegistry', () => {
  let registry: ScrollSurfaceRegistry;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    registry = TestBed.inject(ScrollSurfaceRegistry);
  });

  describe('register / unregister / get', () => {
    it('get returns null for an unknown id', () => {
      expect(registry.get('ws-1')).toBeNull();
    });

    it('register stores a surface that get returns', () => {
      const { surface } = makeSurface();
      registry.register('ws-1', surface);
      expect(registry.get('ws-1')).toBe(surface);
    });

    it('register replaces a prior entry for the same id', () => {
      const a = makeSurface();
      const b = makeSurface();
      registry.register('ws-1', a.surface);
      registry.register('ws-1', b.surface);
      expect(registry.get('ws-1')).toBe(b.surface);
    });

    it('unregister flips the entry to null', () => {
      const { surface } = makeSurface();
      registry.register('ws-1', surface);
      registry.unregister('ws-1');
      expect(registry.get('ws-1')).toBeNull();
    });

    it('unregister is idempotent', () => {
      registry.unregister('never-registered');
      expect(registry.get('never-registered')).toBeNull();
    });

    it('different ids are isolated', () => {
      const a = makeSurface();
      const b = makeSurface();
      registry.register('ws-1', a.surface);
      registry.register('ws-2', b.surface);
      expect(registry.get('ws-1')).toBe(a.surface);
      expect(registry.get('ws-2')).toBe(b.surface);
    });
  });

  describe('entry — reactive', () => {
    it('returns the same signal across calls for a given id', () => {
      const e1 = registry.entry('ws-1');
      const e2 = registry.entry('ws-1');
      expect(e1).toBe(e2);
    });

    it('reads null before any register', () => {
      expect(registry.entry('ws-1')()).toBeNull();
    });

    it('flips through register → unregister → re-register transitions', () => {
      const a = makeSurface();
      const b = makeSurface();
      const e = registry.entry('ws-1');

      expect(e()).toBeNull();
      registry.register('ws-1', a.surface);
      expect(e()).toBe(a.surface);
      registry.unregister('ws-1');
      expect(e()).toBeNull();
      registry.register('ws-1', b.surface);
      expect(e()).toBe(b.surface);
    });
  });

  describe('isAtBottom — reactive', () => {
    it('defaults to true when no surface is registered', () => {
      expect(registry.isAtBottom('ws-1')()).toBe(true);
    });

    it('tracks the registered surface isAtBottom signal', () => {
      const { surface, atBottom } = makeSurface({ isAtBottom: false });
      registry.register('ws-1', surface);
      expect(registry.isAtBottom('ws-1')()).toBe(false);
      atBottom.set(true);
      expect(registry.isAtBottom('ws-1')()).toBe(true);
    });

    it('reverts to default true when the surface unregisters', () => {
      const { surface } = makeSurface({ isAtBottom: false });
      registry.register('ws-1', surface);
      expect(registry.isAtBottom('ws-1')()).toBe(false);
      registry.unregister('ws-1');
      expect(registry.isAtBottom('ws-1')()).toBe(true);
    });
  });
});
