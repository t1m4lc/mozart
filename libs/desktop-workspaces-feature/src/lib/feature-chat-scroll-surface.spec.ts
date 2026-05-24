import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
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

// Test host that gives the surface a scrollable ancestor — mirrors
// the production layout where <main> is the scroll surface.
@Component({
  selector: 'app-test-host',
  imports: [FeatureChatScrollSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      data-testid="main-scroll"
      style="overflow-y: auto; height: 200px;"
    >
      <app-feature-chat-scroll-surface [workspaceId]="workspaceId()">
        <div data-testid="chat-body" [style.height.px]="contentHeight()"></div>
      </app-feature-chat-scroll-surface>
    </main>
  `,
})
class TestHost {
  readonly workspaceId = signal<string | null>('ws-1');
  readonly contentHeight = signal(1000);
}

function configure(
  options: { activeChat?: FakeChat | null } = {},
) {
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
    orchestrator: TestBed.inject(ChatScrollOrchestrator),
  };
}

async function mountHost() {
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  // Allow the afterNextRender mainEl resolution to run.
  await new Promise((r) => setTimeout(r, 0));
  return fixture;
}

function getMainEl(fixture: { nativeElement: HTMLElement }): HTMLElement {
  const el = fixture.nativeElement.querySelector<HTMLElement>(
    '[data-testid="main-scroll"]',
  );
  if (!el) throw new Error('main scroll element not found');
  return el;
}

describe('FeatureChatScrollSurface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('orchestrator registration (REGRESSION + new)', () => {
    it('registers its scroll ancestor on mount', async () => {
      const stubs = configure();
      const registerSpy = vi.spyOn(stubs.orchestrator, 'register');

      const fixture = await mountHost();

      expect(registerSpy).toHaveBeenCalledTimes(1);
      const [wsId, mainEl] = registerSpy.mock.calls[0];
      expect(wsId).toBe('ws-1');
      expect(mainEl).toBe(getMainEl(fixture));
    });

    it('unregisters on destroy', async () => {
      const stubs = configure();
      const unregisterSpy = vi.spyOn(stubs.orchestrator, 'unregister');

      const fixture = await mountHost();
      fixture.destroy();

      expect(unregisterSpy).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('at-bottom detector (REGRESSION)', () => {
    it('flips chat to attached when scrolled near the bottom', async () => {
      const stubs = configure();
      await mountHost();
      const mainEl = document.body.querySelector<HTMLElement>(
        '[data-testid="main-scroll"]',
      );
      if (!mainEl) throw new Error('main not found');

      // Detached → near-bottom scroll should flip to attached.
      stubs.scroll.setDetached('chat-1');
      Object.defineProperty(mainEl, 'scrollHeight', {
        value: 1000,
        configurable: true,
      });
      Object.defineProperty(mainEl, 'clientHeight', {
        value: 200,
        configurable: true,
      });
      // distance = 1000 - 790 - 200 = 10 (< 50 threshold)
      mainEl.scrollTop = 790;
      mainEl.dispatchEvent(new Event('scroll'));

      expect(stubs.scroll.isAttached('chat-1')).toBe(true);
    });

    it('flips chat to detached when scrolled away from the bottom', async () => {
      const stubs = configure();
      await mountHost();
      const mainEl = document.body.querySelector<HTMLElement>(
        '[data-testid="main-scroll"]',
      );
      if (!mainEl) throw new Error('main not found');

      // Attached → scroll up should flip to detached.
      stubs.scroll.setAttached('chat-1');
      Object.defineProperty(mainEl, 'scrollHeight', {
        value: 1000,
        configurable: true,
      });
      Object.defineProperty(mainEl, 'clientHeight', {
        value: 200,
        configurable: true,
      });
      // distance = 1000 - 100 - 200 = 700 (>> 50)
      mainEl.scrollTop = 100;
      mainEl.dispatchEvent(new Event('scroll'));

      expect(stubs.scroll.isAttached('chat-1')).toBe(false);
    });

    it('respects the orchestrator grace period (REGRESSION)', async () => {
      const stubs = configure();
      await mountHost();
      const mainEl = document.body.querySelector<HTMLElement>(
        '[data-testid="main-scroll"]',
      );
      if (!mainEl) throw new Error('main not found');

      // Force the orchestrator into a grace period as if a smooth
      // programmatic scroll were in flight.
      vi.spyOn(stubs.orchestrator, 'isInGracePeriod').mockReturnValue(true);

      stubs.scroll.setAttached('chat-1');
      Object.defineProperty(mainEl, 'scrollHeight', {
        value: 1000,
        configurable: true,
      });
      Object.defineProperty(mainEl, 'clientHeight', {
        value: 200,
        configurable: true,
      });
      // distance = 700 — would normally flip to detached, but the
      // grace window suppresses the flip.
      mainEl.scrollTop = 100;
      mainEl.dispatchEvent(new Event('scroll'));

      expect(stubs.scroll.isAttached('chat-1')).toBe(true);
    });
  });
});
