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

// Test host that wraps the surface in a relative container; the
// surface itself owns the scroll (overflow-y-auto on its host class)
// because the composer is absolutely positioned over it in production.
@Component({
  selector: 'app-test-host',
  imports: [FeatureChatScrollSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="position: relative; height: 200px;">
      <app-feature-chat-scroll-surface
        data-testid="chat-surface"
        style="overflow-y: auto; height: 200px;"
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

function getScrollEl(fixture: { nativeElement: HTMLElement }): HTMLElement {
  const el = fixture.nativeElement.querySelector<HTMLElement>(
    '[data-testid="chat-surface"]',
  );
  if (!el) throw new Error('chat scroll surface element not found');
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
      // After the absolute-composer refactor, chat-scroll-surface owns
      // its own scroll (overflow-y-auto on the host). closestScrollable
      // returns the host element itself.
      expect(mainEl).toBe(getScrollEl(fixture));
    });

    it('unregisters on destroy', async () => {
      const stubs = configure();
      const unregisterSpy = vi.spyOn(stubs.orchestrator, 'unregister');

      const fixture = await mountHost();
      fixture.destroy();

      expect(unregisterSpy).toHaveBeenCalledWith('ws-1');
    });

    it('re-registers when workspaceId changes and unregisters the prior', async () => {
      const stubs = configure();
      const registerSpy = vi.spyOn(stubs.orchestrator, 'register');
      const unregisterSpy = vi.spyOn(stubs.orchestrator, 'unregister');

      const fixture = await mountHost();
      const host = fixture.componentInstance as TestHost;

      // Initial mount registers ws-1 (covered by the first spec).
      expect(registerSpy).toHaveBeenCalledTimes(1);

      // Simulate a workspace switch within the same chat-scroll-surface
      // instance — Angular keeps the view alive when the parent's @if /
      // @switch stays truthy across the navigation.
      host.workspaceId.set('ws-2');
      fixture.detectChanges();
      await fixture.whenStable();

      // The prior workspace's binding is released and the new one
      // takes its place. Without this, composer.scrollToBottom for
      // ws-2 would silently no-op and ws-1's entry would leak.
      expect(unregisterSpy).toHaveBeenCalledWith('ws-1');
      expect(registerSpy).toHaveBeenCalledTimes(2);
      const [, secondMainEl] = registerSpy.mock.calls[1];
      expect(registerSpy.mock.calls[1][0]).toBe('ws-2');
      expect(secondMainEl).toBe(getScrollEl(fixture));
    });
  });

  describe('tab-key scroll recall (REGRESSION)', () => {
    it('recalls and restores scrollTop on first mount even though mainEl resolves after _chatTabKey', async () => {
      // The tab-key stream listens on combineLatest([_chatTabKey,
      // _mainEl]) so it can fire when EITHER resolves. _chatTabKey
      // computes synchronously after CD; _mainEl is set inside
      // afterNextRender (one tick later). If the stream only filtered
      // on this.mainEl (non-reactive), the first emission would land
      // before mainEl resolves and the recall would never fire.
      const stubs = configure();
      const recallSpy = vi.spyOn(stubs.scroll, 'recall');

      const fixture = await mountHost();
      const main = getScrollEl(fixture);
      Object.defineProperty(main, 'scrollHeight', {
        value: 1000,
        configurable: true,
      });

      // _chatTabKey resolves to `chat:ws-1:chat-1` synchronously
      // (active chat is seeded in the configure() stub). mainEl
      // resolves inside afterNextRender. Once both have emitted via
      // combineLatest, recall fires for the resolved key.
      expect(recallSpy).toHaveBeenCalledWith('chat:ws-1:chat-1');
    });

    it('remembers scrollTop on chat switch and recalls for the new key', async () => {
      const stubs = configure();
      const recallSpy = vi.spyOn(stubs.scroll, 'recall');
      const rememberSpy = vi.spyOn(stubs.scroll, 'remember');

      const fixture = await mountHost();
      const main = getScrollEl(fixture);
      Object.defineProperty(main, 'scrollHeight', {
        value: 1000,
        configurable: true,
      });
      main.scrollTop = 420;

      // Simulate a chat switch — the active chat signal changes,
      // which flips _chatTabKey, which fires combineLatest with the
      // new pair. switchMap unsubscribes the prior inner observable
      // (finalize fires remember on the prior key) and subscribes
      // the new inner (tap.subscribe fires recall on the new key).
      stubs.activeChatSignal.set(makeChat('chat-2', 'ws-1'));
      fixture.detectChanges();
      await fixture.whenStable();
      // Allow combineLatest's microtask to flush.
      await new Promise((r) => setTimeout(r, 0));

      expect(rememberSpy).toHaveBeenCalledWith('chat:ws-1:chat-1', 420);
      expect(recallSpy).toHaveBeenCalledWith('chat:ws-1:chat-2');
    });
  });

  describe('at-bottom detector (REGRESSION)', () => {
    it('flips chat to attached when scrolled near the bottom', async () => {
      const stubs = configure();
      await mountHost();
      const mainEl = document.body.querySelector<HTMLElement>(
        '[data-testid="chat-surface"]',
      );
      if (!mainEl) throw new Error('chat scroll surface not found');

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
        '[data-testid="chat-surface"]',
      );
      if (!mainEl) throw new Error('chat scroll surface not found');

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
        '[data-testid="chat-surface"]',
      );
      if (!mainEl) throw new Error('chat scroll surface not found');

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
