import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatScrollOrchestrator } from './chat-scroll-orchestrator.service';

// jsdom doesn't implement Element.scrollTo, so every test that calls
// scrollToBottom needs a stubbed scroll surface.
function makeScrollableElement(scrollHeight = 1000): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  el.scrollTo = vi.fn();
  return el;
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('ChatScrollOrchestrator', () => {
  let service: ChatScrollOrchestrator;
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatScrollOrchestrator);

    currentTime = 1000;
    nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('register / unregister', () => {
    it('scrollToBottom is a no-op before registration', () => {
      stubMatchMedia(false);
      // Should not throw.
      service.scrollToBottom('ws-1', true);
      expect(service.isInGracePeriod('ws-1')).toBe(false);
    });

    it('after register, scrollToBottom drives the registered element', () => {
      stubMatchMedia(false);
      const el = makeScrollableElement(2400);
      service.register('ws-1', el);

      service.scrollToBottom('ws-1', false);

      expect(el.scrollTo).toHaveBeenCalledWith({
        top: 2400,
        behavior: 'auto',
      });
    });

    it('unregister stops the surface from receiving subsequent scrolls', () => {
      stubMatchMedia(false);
      const el = makeScrollableElement();
      service.register('ws-1', el);
      service.unregister('ws-1');

      service.scrollToBottom('ws-1', true);

      expect(el.scrollTo).not.toHaveBeenCalled();
      expect(service.isInGracePeriod('ws-1')).toBe(false);
    });
  });

  describe('scrollToBottom — prefers-reduced-motion', () => {
    it('smooth=true honors reduced-motion and falls back to auto', () => {
      stubMatchMedia(true);
      const el = makeScrollableElement();
      service.register('ws-1', el);

      service.scrollToBottom('ws-1', true);

      expect(el.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' }),
      );
      // No grace window when the scroll fell back to auto — auto
      // scrolls are instant and don't fire partway scroll events.
      expect(service.isInGracePeriod('ws-1')).toBe(false);
    });

    it('smooth=true with no reduced-motion uses smooth behavior', () => {
      stubMatchMedia(false);
      const el = makeScrollableElement();
      service.register('ws-1', el);

      service.scrollToBottom('ws-1', true);

      expect(el.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
    });
  });

  describe('programmatic-scroll grace window', () => {
    it('smooth scroll opens a 700ms grace window', () => {
      stubMatchMedia(false);
      const el = makeScrollableElement();
      service.register('ws-1', el);

      service.scrollToBottom('ws-1', true);

      expect(service.isInGracePeriod('ws-1')).toBe(true);
      currentTime += 699;
      expect(service.isInGracePeriod('ws-1')).toBe(true);
      currentTime += 2;
      expect(service.isInGracePeriod('ws-1')).toBe(false);
    });

    it('auto scroll (smooth=false) does NOT open a grace window', () => {
      stubMatchMedia(false);
      const el = makeScrollableElement();
      service.register('ws-1', el);

      service.scrollToBottom('ws-1', false);

      expect(service.isInGracePeriod('ws-1')).toBe(false);
    });

    it('grace windows are isolated per workspace', () => {
      stubMatchMedia(false);
      const a = makeScrollableElement();
      const b = makeScrollableElement();
      service.register('ws-a', a);
      service.register('ws-b', b);

      service.scrollToBottom('ws-a', true);

      expect(service.isInGracePeriod('ws-a')).toBe(true);
      expect(service.isInGracePeriod('ws-b')).toBe(false);
    });
  });

  describe('focusRequest channel', () => {
    it('emits null before any request', () => {
      expect(service.focusRequest()).toBeNull();
    });

    it('requestFocus emits the workspaceId with an increasing nonce', () => {
      service.requestFocus('ws-1');
      const first = service.focusRequest();
      expect(first).not.toBeNull();
      expect(first?.workspaceId).toBe('ws-1');
      const firstNonce = first?.nonce ?? 0;

      service.requestFocus('ws-1');
      const second = service.focusRequest();
      expect(second?.workspaceId).toBe('ws-1');
      expect(second?.nonce).toBeGreaterThan(firstNonce);
    });

    it('consecutive workspaces produce distinct payloads', () => {
      service.requestFocus('ws-a');
      const a = service.focusRequest();
      service.requestFocus('ws-b');
      const b = service.focusRequest();

      expect(a?.workspaceId).toBe('ws-a');
      expect(b?.workspaceId).toBe('ws-b');
      expect(b?.nonce).toBeGreaterThan(a?.nonce ?? 0);
    });
  });
});
