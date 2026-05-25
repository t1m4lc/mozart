import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  ScrollPositionService,
  ScrollSurfaceRegistry,
} from '@mozart/desktop-workspaces-data-access';

import { FeatureChatScrollSurface } from './feature-chat-scroll-surface';

interface FakeChat {
  id: string;
  workspaceId: string;
  modelId: string | null;
  mode: 'agent';
  effort: 'medium';
  title: string;
  lastReadMessageId: string | null;
  createdAt: number;
}

function makeChat(id = 'chat-1', workspaceId = 'ws-1'): FakeChat {
  return {
    id,
    workspaceId,
    modelId: 'opus',
    mode: 'agent',
    effort: 'medium',
    title: 'Chat',
    lastReadMessageId: null,
    createdAt: 0,
  };
}

// Test host that wraps the surface; the surface delegates scroll
// behavior to its inner MzScrollSurface directive.
@Component({
  selector: 'app-test-host',
  imports: [FeatureChatScrollSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="position: relative; height: 200px;">
      <app-feature-chat-scroll-surface
        data-testid="chat-surface"
        style="height: 200px;"
        [workspaceId]="workspaceId()"
      >
        <div data-testid="chat-body" [style.height.px]="contentHeight()"></div>
      </app-feature-chat-scroll-surface>
    </div>
  `,
})
class TestHost {
  readonly workspaceId = signal<string | null>('ws-1');
  readonly contentHeight = signal(1000);
}

function configure(options: { activeChat?: FakeChat | null } = {}) {
  const activeChatSignal = signal<FakeChat | null>(
    options.activeChat ?? makeChat(),
  );
  const messagesSignal = signal<readonly unknown[]>([]);

  const chatFacade = {
    activeChatFor: vi.fn(() => activeChatSignal() as FakeChat | null),
    messagesForWorkspace: vi.fn(() => messagesSignal),
  };

  TestBed.configureTestingModule({
    providers: [{ provide: ChatFacade, useValue: chatFacade }],
  });

  return {
    chatFacade,
    activeChatSignal,
    messagesSignal,
    scroll: TestBed.inject(ScrollPositionService),
    registry: TestBed.inject(ScrollSurfaceRegistry),
  };
}

async function mountHost() {
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  // Allow the afterNextRender directive lifecycle to run.
  await new Promise((r) => setTimeout(r, 0));
  return fixture;
}

function getInnerScrollEl(fixture: {
  nativeElement: HTMLElement;
}): HTMLElement {
  const el = fixture.nativeElement.querySelector<HTMLElement>(
    '[data-testid="chat-surface-scroll"]',
  );
  if (!el) throw new Error('chat surface scroll container not found');
  return el;
}

describe('FeatureChatScrollSurface', () => {
  // jsdom 27 lacks scrollTo / IntersectionObserver — stub minimally so
  // the embedded MzScrollSurface directive can run.
  beforeEach(() => {
    if (!('scrollTo' in HTMLElement.prototype)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).scrollTo = function (
        arg: number | ScrollToOptions,
      ) {
        if (typeof arg === 'number') {
          this.scrollTop = arg;
        } else if (arg && typeof arg === 'object' && typeof arg.top === 'number') {
          this.scrollTop = arg.top;
        }
      };
    }
    if (typeof globalThis.IntersectionObserver === 'undefined') {
      class NoopIO implements IntersectionObserver {
        readonly root: Element | Document | null = null;
        readonly rootMargin: string = '';
        readonly thresholds: ReadonlyArray<number> = [];
        observe(): void {
          /* noop */
        }
        unobserve(): void {
          /* noop */
        }
        disconnect(): void {
          /* noop */
        }
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      }
      (
        globalThis as { IntersectionObserver: typeof IntersectionObserver }
      ).IntersectionObserver = NoopIO as unknown as typeof IntersectionObserver;
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('registry seam', () => {
    it('registers the inner scroll container under workspaceId', async () => {
      const stubs = configure();
      await mountHost();
      const surface = stubs.registry.get('ws-1');
      expect(surface).not.toBeNull();
      // The element exposed by the registered ScrollSurface is the
      // inner scroll container (the directive's host).
      expect(surface?.element()).toBeTruthy();
    });

    it('unregisters on destroy', async () => {
      const stubs = configure();
      const fixture = await mountHost();
      expect(stubs.registry.get('ws-1')).not.toBeNull();
      fixture.destroy();
      expect(stubs.registry.get('ws-1')).toBeNull();
    });

    it('re-registers when workspaceId changes', async () => {
      const stubs = configure();
      const fixture = await mountHost();
      const host = fixture.componentInstance as TestHost;

      expect(stubs.registry.get('ws-1')).not.toBeNull();
      host.workspaceId.set('ws-2');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(stubs.registry.get('ws-1')).toBeNull();
      expect(stubs.registry.get('ws-2')).not.toBeNull();
    });
  });

  describe('chat-key persistence (delegated to MzScrollSurface)', () => {
    it('uses chat:{ws}:{chatId} as the persistence key', async () => {
      const stubs = configure();
      const recallSpy = vi.spyOn(stubs.scroll, 'recall');
      await mountHost();
      expect(recallSpy).toHaveBeenCalledWith('chat:ws-1:chat-1');
    });

    it('switches the persistence key when the active chat changes', async () => {
      const stubs = configure();
      const recallSpy = vi.spyOn(stubs.scroll, 'recall');
      const rememberSpy = vi.spyOn(stubs.scroll, 'remember');

      const fixture = await mountHost();
      const inner = getInnerScrollEl(fixture);
      inner.scrollTop = 420;

      stubs.activeChatSignal.set(makeChat('chat-2', 'ws-1'));
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));

      expect(rememberSpy).toHaveBeenCalledWith('chat:ws-1:chat-1', 420);
      expect(recallSpy).toHaveBeenCalledWith('chat:ws-1:chat-2');
    });
  });
});
