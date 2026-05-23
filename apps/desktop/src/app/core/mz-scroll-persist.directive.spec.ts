import {
  Component,
  ChangeDetectionStrategy,
  signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  MzScrollPersist,
  type ScrollDefaultPosition,
} from './mz-scroll-persist.directive';
import { ScrollPositionService } from '@mozart/desktop-workspaces-data-access';

// Host shell that lets each test drive the key + default inputs.
@Component({
  selector: 'app-test-host',
  imports: [MzScrollPersist],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      data-testid="scroller"
      style="overflow-y: auto; height: 100px;"
      [mzScrollPersist]="tabKey()"
      [mzScrollPersistDefault]="defaultPosition()"
    >
      <div style="height: 500px;">tall content</div>
    </div>
  `,
})
class TestHost {
  readonly tabKey: WritableSignal<string | null> = signal<string | null>('k1');
  readonly defaultPosition: WritableSignal<ScrollDefaultPosition> =
    signal<ScrollDefaultPosition>('top');
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

describe('MzScrollPersist directive', () => {
  let service: ScrollPositionService;
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    service = TestBed.inject(ScrollPositionService);
    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
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
      // jsdom doesn't lay out, but assigning scrollHeight to scrollTop
      // is observable as the value itself.
      expect(el.scrollTop).toBe(el.scrollHeight);
    });

    it('null key disables persistence — does not read or write the service', async () => {
      host.tabKey.set(null);
      service.remember('k1', 42); // should NOT be applied
      await flushRender(fixture);
      // With null key, the directive skips both restore and snapshot.
      // Service entry stays intact; scrollTop stays at jsdom default (0).
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

      // Simulate the user scrolling.
      el.scrollTop = 250;

      // Switch keys.
      service.remember('k2', 50);
      host.tabKey.set('k2');
      await flushRender(fixture);

      // Prior key snapshot took the new scrollTop value (250).
      expect(service.recall('k1')).toBe(250);
      // New key restored to its stored value (50).
      expect(el.scrollTop).toBe(50);
    });

    it('falls back to default when the new key has no stored value', async () => {
      service.remember('k1', 100);
      await flushRender(fixture);
      const el = getScroller(fixture);
      el.scrollTop = 200;

      host.tabKey.set('k2');
      await flushRender(fixture);

      // k1 captured the value before switch.
      expect(service.recall('k1')).toBe(200);
      // k2 had no stored value — default 'top' applies.
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

      // The stored 60 stays unchanged.
      expect(service.recall('k1')).toBe(60);
    });
  });
});
