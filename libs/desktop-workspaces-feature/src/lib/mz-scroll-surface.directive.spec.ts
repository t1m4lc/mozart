import {
  Component,
  ChangeDetectionStrategy,
  signal,
  viewChild,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  MzScrollSurface,
  type ScrollDefaultPosition,
} from './mz-scroll-surface.directive';
import {
  ScrollPositionService,
  ScrollSurfaceRegistry,
} from '@mozart/desktop-workspaces-data-access';

// Minimal IO mock — captures the most recent observer so tests can
// drive intersection state directly. jsdom doesn't lay out, so we
// don't rely on the observer firing from the real browser engine.
interface MockIO {
  callback: IntersectionObserverCallback;
  observed: Element[];
  disconnected: boolean;
  fire(isIntersecting: boolean): void;
}
let lastIO: MockIO | null = null;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  private readonly _state: MockIO;

  constructor(callback: IntersectionObserverCallback) {
    const state: MockIO = {
      callback,
      observed: [],
      disconnected: false,
      fire(isIntersecting: boolean) {
        const entries = state.observed.map(
          (target) =>
            ({
              isIntersecting,
              target,
              intersectionRatio: isIntersecting ? 1 : 0,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            }) as IntersectionObserverEntry,
        );
        callback(entries, this as unknown as IntersectionObserver);
      },
    };
    this._state = state;
    lastIO = state;
  }

  observe(target: Element): void {
    this._state.observed.push(target);
  }
  unobserve(target: Element): void {
    this._state.observed = this._state.observed.filter((e) => e !== target);
  }
  disconnect(): void {
    this._state.disconnected = true;
    this._state.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// Host shell that exposes inputs for direct test control + a
// `viewChild` ref to the directive so we can drive imperative methods.
@Component({
  selector: 'app-test-host',
  imports: [MzScrollSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-testid="scroller"
      style="overflow-y: auto; height: 100px;"
      [mzScrollSurface]="tabKey()"
      [mzScrollSurfaceDefault]="defaultPosition()"
      [mzScrollSurfaceAutoFollow]="autoFollow()"
      [mzScrollSurfaceRegisterAs]="registerAs()"
      #surfaceRef="mzScrollSurface"
    >
      <div style="height: 500px;">tall content</div>
      <div data-scroll-sentinel data-testid="sentinel"></div>
    </div>
  `,
})
class TestHost {
  readonly tabKey: WritableSignal<string | null> = signal<string | null>('k1');
  readonly defaultPosition: WritableSignal<ScrollDefaultPosition> =
    signal<ScrollDefaultPosition>('top');
  readonly autoFollow: WritableSignal<boolean> = signal<boolean>(false);
  readonly registerAs: WritableSignal<string | null> = signal<string | null>(
    null,
  );
  readonly surfaceRef = viewChild.required<MzScrollSurface>('surfaceRef');
}

async function flushRender(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function getScroller(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement.querySelector(
    '[data-testid="scroller"]',
  ) as HTMLElement;
}

describe('MzScrollSurface directive', () => {
  let service: ScrollPositionService;
  let registry: ScrollSurfaceRegistry;
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;
  let originalIO: typeof IntersectionObserver | undefined;

  beforeEach(() => {
    // Polyfill IntersectionObserver — jsdom 27 doesn't ship one.
    originalIO = (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    lastIO = null;

    // jsdom 27 doesn't implement Element.scrollTo or scrollIntoView.
    // Stub both so the directive's imperative API is testable. scrollTo
    // mirrors the real behavior: assign scrollTop from the `top` option.
    if (!('scrollTo' in HTMLElement.prototype)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).scrollTo = function (
        arg: number | ScrollToOptions,
      ) {
        if (typeof arg === 'number') {
          this.scrollTop = arg;
        } else if (arg && typeof arg === 'object') {
          if (typeof arg.top === 'number') this.scrollTop = arg.top;
          if (typeof arg.left === 'number') this.scrollLeft = arg.left;
        }
      };
    }
    if (!('scrollIntoView' in HTMLElement.prototype)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).scrollIntoView = function (): void {
        /* noop — spy targets the property, not the side effect */
      };
    }

    TestBed.configureTestingModule({ imports: [TestHost] });
    service = TestBed.inject(ScrollPositionService);
    registry = TestBed.inject(ScrollSurfaceRegistry);
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    if (originalIO === undefined) {
      delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    } else {
      (globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = originalIO;
    }
  });

  describe('restore on mount', () => {
    it('restores stored scrollTop after first render', async () => {
      service.remember('k1', 137);
      await flushRender(fixture);
      expect(getScroller(fixture).scrollTop).toBe(137);
    });

    it('lands at top when no stored value and default is "top"', async () => {
      host.defaultPosition.set('top');
      await flushRender(fixture);
      expect(getScroller(fixture).scrollTop).toBe(0);
    });

    it('lands at scrollHeight when no stored value and default is "bottom"', async () => {
      host.defaultPosition.set('bottom');
      await flushRender(fixture);
      const el = getScroller(fixture);
      expect(el.scrollTop).toBe(el.scrollHeight);
    });

    it('null key disables persistence — does not read or write the service', async () => {
      host.tabKey.set(null);
      service.remember('k1', 42);
      await flushRender(fixture);
      expect(service.recall('k1')).toBe(42);
      expect(getScroller(fixture).scrollTop).toBe(0);
    });
  });

  describe('snapshot on key change', () => {
    it('writes prior key scrollTop before restoring new key', async () => {
      service.remember('k1', 100);
      await flushRender(fixture);
      const el = getScroller(fixture);
      expect(el.scrollTop).toBe(100);

      el.scrollTop = 250;
      service.remember('k2', 50);
      host.tabKey.set('k2');
      await flushRender(fixture);

      expect(service.recall('k1')).toBe(250);
      expect(el.scrollTop).toBe(50);
    });

    it('falls back to default when the new key has no stored value', async () => {
      service.remember('k1', 100);
      await flushRender(fixture);
      const el = getScroller(fixture);
      el.scrollTop = 200;

      host.tabKey.set('k2');
      await flushRender(fixture);

      expect(service.recall('k1')).toBe(200);
      expect(el.scrollTop).toBe(0);
    });
  });

  describe('snapshot on destroy', () => {
    it('writes scrollTop to service when the directive is destroyed', async () => {
      service.remember('k1', 60);
      await flushRender(fixture);
      const el = getScroller(fixture);
      el.scrollTop = 333;

      fixture.destroy();

      expect(service.recall('k1')).toBe(333);
    });

    it('destroy with a null key does NOT write to the service', async () => {
      service.remember('k1', 60);
      await flushRender(fixture);
      host.tabKey.set(null);
      await flushRender(fixture);

      fixture.destroy();

      expect(service.recall('k1')).toBe(60);
    });
  });

  describe('imperative setKey()', () => {
    it('updates the active key without going through the input', async () => {
      service.remember('imperative', 77);
      await flushRender(fixture);
      const el = getScroller(fixture);
      // Imperative override: switch the active key from 'k1' to 'imperative'.
      host.surfaceRef().setKey('imperative');
      await flushRender(fixture);
      expect(el.scrollTop).toBe(77);
    });
  });

  describe('imperative scrollToBottom / scrollIntoView / scrollTo', () => {
    it('scrollToBottom moves scrollTop to scrollHeight', async () => {
      await flushRender(fixture);
      const el = getScroller(fixture);
      host.surfaceRef().scrollToBottom(false);
      expect(el.scrollTop).toBe(el.scrollHeight);
    });

    it('scrollTo moves to an arbitrary offset', async () => {
      await flushRender(fixture);
      const el = getScroller(fixture);
      host.surfaceRef().scrollTo(42, false);
      expect(el.scrollTop).toBe(42);
    });

    it('scrollIntoView calls scrollIntoView on the target', async () => {
      await flushRender(fixture);
      const sentinel = fixture.nativeElement.querySelector(
        '[data-testid="sentinel"]',
      ) as HTMLElement;
      const spy = vi.spyOn(sentinel, 'scrollIntoView');
      host.surfaceRef().scrollIntoView(sentinel);
      expect(spy).toHaveBeenCalledTimes(1);
      const callArg = spy.mock.calls[0]?.[0] as ScrollIntoViewOptions;
      expect(callArg.block).toBe('start');
    });
  });

  describe('autoFollow + IntersectionObserver', () => {
    it('does not create an IO when autoFollow=false', async () => {
      host.autoFollow.set(false);
      await flushRender(fixture);
      expect(lastIO).toBeNull();
      // Default isAtBottom is true.
      expect(host.surfaceRef().isAtBottom()).toBe(true);
    });

    it('creates an IO observing the sentinel when autoFollow=true', async () => {
      host.autoFollow.set(true);
      await flushRender(fixture);
      expect(lastIO).not.toBeNull();
      expect(lastIO?.observed.length).toBe(1);
    });

    it('writes isAtBottom to true when sentinel intersects', async () => {
      host.autoFollow.set(true);
      await flushRender(fixture);
      lastIO?.fire(true);
      expect(host.surfaceRef().isAtBottom()).toBe(true);
    });

    it('writes isAtBottom to false when sentinel is out of view', async () => {
      host.autoFollow.set(true);
      await flushRender(fixture);
      lastIO?.fire(false);
      expect(host.surfaceRef().isAtBottom()).toBe(false);
    });

    it('disconnects the IO on destroy', async () => {
      host.autoFollow.set(true);
      await flushRender(fixture);
      const captured = lastIO;
      expect(captured?.disconnected).toBe(false);
      fixture.destroy();
      expect(captured?.disconnected).toBe(true);
    });
  });

  describe('registerAs + ScrollSurfaceRegistry', () => {
    it('registers under registerAs on mount', async () => {
      host.registerAs.set('ws-1');
      await flushRender(fixture);
      expect(registry.get('ws-1')).toBe(host.surfaceRef());
    });

    it('does not register when registerAs is null', async () => {
      await flushRender(fixture);
      expect(registry.get('ws-1')).toBeNull();
    });

    it('unregisters on destroy', async () => {
      host.registerAs.set('ws-1');
      await flushRender(fixture);
      expect(registry.get('ws-1')).toBe(host.surfaceRef());
      fixture.destroy();
      expect(registry.get('ws-1')).toBeNull();
    });

    it('re-registers when registerAs changes', async () => {
      host.registerAs.set('ws-1');
      await flushRender(fixture);
      host.registerAs.set('ws-2');
      await flushRender(fixture);
      expect(registry.get('ws-1')).toBeNull();
      expect(registry.get('ws-2')).toBe(host.surfaceRef());
    });
  });
});
