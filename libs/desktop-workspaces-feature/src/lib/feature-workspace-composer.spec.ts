import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
  WorkspacesFacade,
} from '@mozart/desktop-workspaces-data-access';

import { FeatureWorkspaceComposer } from './feature-workspace-composer';

interface FakeChat {
  id: string;
  workspaceId: string;
  title: string;
  modelId: string | null;
  mode: 'agent' | 'ask';
  effort: 'low' | 'medium' | 'high';
  lastReadMessageId: string | null;
  createdAt: number;
}

function makeChat(overrides: Partial<FakeChat> = {}): FakeChat {
  return {
    id: 'chat-1',
    workspaceId: 'ws-1',
    title: 'Chat',
    modelId: 'opus',
    mode: 'agent',
    effort: 'medium',
    lastReadMessageId: null,
    createdAt: 0,
    ...overrides,
  };
}

interface ChatFacadeStubState {
  activeChat: FakeChat | null;
  streaming: boolean;
}

function configure(state: ChatFacadeStubState) {
  const activeChatSignal = signal<FakeChat | null>(state.activeChat);
  const streamingSignal = signal<boolean>(state.streaming);
  const messagesSignal = signal<readonly unknown[]>([]);

  const chatFacade = {
    activeChatFor: vi.fn(() => activeChatSignal()),
    isStreaming: vi.fn(() => streamingSignal),
    messagesForWorkspace: vi.fn(() => messagesSignal),
    sendUserMessage: vi.fn(async () => undefined),
    cancelActive: vi.fn(),
    setChatMode: vi.fn(async () => undefined),
    setChatEffort: vi.fn(async () => undefined),
    setChatModel: vi.fn(async () => undefined),
  };

  const workspacesFacade = {
    hasOtherUnreadInProject: vi.fn(() => signal(false)),
    nextUnreadInProject: vi.fn(() => null),
    workspaceById: vi.fn(() => signal(null)),
  };

  const router = { navigate: vi.fn(async () => true) };

  TestBed.configureTestingModule({
    providers: [
      { provide: ChatFacade, useValue: chatFacade },
      { provide: WorkspacesFacade, useValue: workspacesFacade },
      { provide: Router, useValue: router },
    ],
  });

  // ScrollPositionService and ChatScrollOrchestrator are simple
  // root-providedIn services with no Tauri dependency — use the real
  // ones so the wiring is exercised end-to-end.
  const scroll = TestBed.inject(ScrollPositionService);
  const orchestrator = TestBed.inject(ChatScrollOrchestrator);

  return {
    chatFacade,
    workspacesFacade,
    router,
    scroll,
    orchestrator,
    activeChatSignal,
    streamingSignal,
  };
}

function mountComposer(opts: {
  workspaceId: string | null;
  activeTabKind: 'chat' | 'file' | null;
  frozen?: boolean;
}) {
  const fixture = TestBed.createComponent(FeatureWorkspaceComposer);
  fixture.componentRef.setInput('workspaceId', opts.workspaceId);
  fixture.componentRef.setInput('activeTabKind', opts.activeTabKind);
  fixture.componentRef.setInput('frozen', opts.frozen ?? false);
  fixture.detectChanges();
  return fixture;
}

describe('FeatureWorkspaceComposer', () => {
  describe('onSend routing', () => {
    it('routes to ChatFacade.sendUserMessage on chat tab', async () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });
      const cmp = fixture.componentInstance as unknown as {
        onSend: (e: { text: string; mode: 'agent' }) => void;
      };

      cmp.onSend({ text: 'hello', mode: 'agent' });

      expect(stubs.chatFacade.sendUserMessage).toHaveBeenCalledWith(
        'ws-1',
        'hello',
        'agent',
      );
    });

    it('routes to ChatFacade.sendUserMessage on file tab as well', async () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'file',
      });
      const cmp = fixture.componentInstance as unknown as {
        onSend: (e: { text: string; mode: 'agent' }) => void;
      };

      cmp.onSend({ text: 'from file tab', mode: 'agent' });

      expect(stubs.chatFacade.sendUserMessage).toHaveBeenCalledWith(
        'ws-1',
        'from file tab',
        'agent',
      );
    });

    it('does NOT trigger orchestrator scrollToBottom on file tab', () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'file',
      });
      const spy = vi.spyOn(stubs.orchestrator, 'scrollToBottom');
      const cmp = fixture.componentInstance as unknown as {
        onSend: (e: { text: string; mode: 'agent' }) => void;
      };

      cmp.onSend({ text: 'silent send', mode: 'agent' });

      expect(spy).not.toHaveBeenCalled();
    });

    it('triggers orchestrator scrollToBottom on chat tab', () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });
      const spy = vi.spyOn(stubs.orchestrator, 'scrollToBottom');
      const cmp = fixture.componentInstance as unknown as {
        onSend: (e: { text: string; mode: 'agent' }) => void;
      };

      cmp.onSend({ text: 'with scroll', mode: 'agent' });

      expect(spy).toHaveBeenCalledWith('ws-1', true);
    });

    it('is a no-op when workspaceId is null', () => {
      const stubs = configure({ activeChat: null, streaming: false });
      const fixture = mountComposer({
        workspaceId: null,
        activeTabKind: 'chat',
      });
      const cmp = fixture.componentInstance as unknown as {
        onSend: (e: { text: string; mode: 'agent' }) => void;
      };

      cmp.onSend({ text: 'no workspace', mode: 'agent' });

      expect(stubs.chatFacade.sendUserMessage).not.toHaveBeenCalled();
    });
  });

  describe('scroll-to-bottom overlay gate (D3)', () => {
    it('autoFollowChat is forced true on file tab', () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      // Mark chat as detached in ScrollPositionService — on a chat
      // tab this would surface the scroll-to-bottom overlay. On a
      // file tab it must be ignored.
      stubs.scroll.setDetached('chat-1');

      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'file',
      });

      const cmp = fixture.componentInstance as unknown as {
        autoFollowChat: () => boolean;
      };
      expect(cmp.autoFollowChat()).toBe(true);
    });

    it('autoFollowChat reflects ScrollPositionService on chat tab', () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      stubs.scroll.setDetached('chat-1');

      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });

      const cmp = fixture.componentInstance as unknown as {
        autoFollowChat: () => boolean;
      };
      expect(cmp.autoFollowChat()).toBe(false);
    });

    it('onScrollToBottom is a no-op on file tab', () => {
      const stubs = configure({ activeChat: makeChat(), streaming: false });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'file',
      });
      const spy = vi.spyOn(stubs.orchestrator, 'scrollToBottom');
      const cmp = fixture.componentInstance as unknown as {
        onScrollToBottom: () => void;
      };

      cmp.onScrollToBottom();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('facade-bound mode/effort/model (regression)', () => {
    it('reflects activeChat mode/effort/model', () => {
      configure({
        activeChat: makeChat({
          mode: 'ask',
          effort: 'high',
          modelId: 'haiku',
        }),
        streaming: false,
      });

      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });

      const cmp = fixture.componentInstance as unknown as {
        currentMode: () => string;
        currentEffort: () => string;
        currentModelId: () => string;
      };
      expect(cmp.currentMode()).toBe('ask');
      expect(cmp.currentEffort()).toBe('high');
      expect(cmp.currentModelId()).toBe('haiku');
    });

    it('falls back to defaults when activeChat is null', () => {
      configure({ activeChat: null, streaming: false });

      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });

      const cmp = fixture.componentInstance as unknown as {
        currentMode: () => string;
        currentEffort: () => string;
      };
      expect(cmp.currentMode()).toBe('agent');
      expect(cmp.currentEffort()).toBe('medium');
    });
  });
});
