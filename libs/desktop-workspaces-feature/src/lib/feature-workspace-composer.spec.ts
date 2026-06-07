import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ProjectFilesStore } from '@mozart/desktop-files-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import {
  SKILLS_PORT,
  SkillsStore,
  type SkillsPort,
} from '@mozart/desktop-skills-data-access';
import type { DiscoveredSkill } from '@mozart/desktop-skills-util';
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
  /** Discovery backend for the slash menu. Defaults to "no skills". */
  skills?: SkillsPort;
  /** Workspace the composer resolves projectId from. Default: none (null). */
  workspace?: { id: string; projectId: string } | null;
}

function configure(state: ChatFacadeStubState) {
  const activeChatSignal = signal<FakeChat | null>(state.activeChat);
  const streamingSignal = signal<boolean>(state.streaming);
  const messagesSignal = signal<readonly unknown[]>([]);
  const activeAgentProviderSignal = signal<string>('claude_cli');
  const connectedAgentProvidersSignal = signal<readonly string[]>([
    'claude_cli',
  ]);
  const skillsPort: SkillsPort = state.skills ?? {
    list: vi.fn(async () => []),
  };

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
    workspaceById: vi.fn(() => signal(state.workspace ?? null)),
  };

  const router = { navigate: vi.fn(async () => true) };

  // Connected provider → no connect-CTA, so existing assertions are
  // unaffected. The composer only reads these signals + the two probes.
  const profileFacade = {
    initialize: vi.fn(async () => undefined),
    initializeCodex: vi.fn(async () => undefined),
    status: signal('connected'),
    codexStatus: signal('not_connected'),
    hasAnyProvider: signal(true),
    activeAgentProvider: activeAgentProviderSignal,
    connectedAgentProviders: connectedAgentProvidersSignal,
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: ChatFacade, useValue: chatFacade },
      { provide: WorkspacesFacade, useValue: workspacesFacade },
      { provide: ProfileFacade, useValue: profileFacade },
      { provide: Router, useValue: router },
      { provide: SKILLS_PORT, useValue: skillsPort },
      // Stub the file store so this spec doesn't pull the repositories
      // facade chain — the `@` menu isn't under test here.
      {
        provide: ProjectFilesStore,
        useValue: {
          fileEntriesFor: () => signal([]),
          fileLoadingFor: () => signal(false),
          refresh: () => undefined,
        },
      },
    ],
  });

  // ScrollPositionService and ChatScrollOrchestrator are simple
  // root-providedIn services with no Tauri dependency — use the real
  // ones so the wiring is exercised end-to-end.
  const scroll = TestBed.inject(ScrollPositionService);
  const orchestrator = TestBed.inject(ChatScrollOrchestrator);
  const skillsStore = TestBed.inject(SkillsStore);

  return {
    chatFacade,
    workspacesFacade,
    router,
    scroll,
    orchestrator,
    activeChatSignal,
    streamingSignal,
    activeAgentProviderSignal,
    connectedAgentProvidersSignal,
    skillsStore,
  };
}

const wireSkill = (over: Partial<DiscoveredSkill> = {}): DiscoveredSkill => ({
  id: 'commit',
  name: 'Commit',
  description: 'conventional commit',
  source: 'mozart-project',
  runtime: 'any',
  publisher: null,
  scope: 'project',
  ...over,
});

interface SkillGroupVm {
  readonly label: string;
  readonly items: readonly { readonly id: string }[];
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
          modelId: 'claude-haiku-4-5',
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
      // A real, enabled catalog id is reflected as-is.
      expect(cmp.currentModelId()).toBe('claude-haiku-4-5');
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

  describe('slash skill discovery', () => {
    // Backend discovery is provider-scoped: each provider scan returns that
    // provider's skills plus the agnostic Mozart ones. The fake mirrors that.
    const byProvider: SkillsPort = {
      list: vi.fn(async (provider: string) =>
        provider === 'codex'
          ? [
              wireSkill({
                id: 'commit',
                name: 'Commit',
                source: 'mozart-project',
              }),
              wireSkill({
                id: 'codex-review',
                name: 'Codex review',
                source: 'codex-provider',
                runtime: 'codex',
                scope: 'global',
              }),
            ]
          : [
              wireSkill({
                id: 'commit',
                name: 'Commit',
                source: 'mozart-project',
              }),
              wireSkill({
                id: 'review',
                name: 'Review',
                source: 'claude-provider',
                runtime: 'claude',
                scope: 'global',
              }),
            ],
      ),
    };

    it('groups discovered skills by source for the only connected provider', async () => {
      const stubs = configure({
        activeChat: makeChat(),
        streaming: false,
        skills: byProvider,
        workspace: { id: 'ws-1', projectId: 'proj-1' },
      });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });
      // Populate deterministically (refresh always awaits; sidesteps the
      // component's fire-and-forget in-flight load).
      await stubs.skillsStore.refresh('claude_cli', 'proj-1');
      fixture.detectChanges();

      const cmp = fixture.componentInstance as unknown as {
        skillGroups: () => readonly SkillGroupVm[];
      };
      const groups = cmp.skillGroups();
      expect(groups.map((g) => g.label)).toEqual(['Mozart', 'Claude']);
      const ids = groups.flatMap((g) => g.items.map((i) => i.id));
      expect(ids).toContain('commit');
      expect(ids).toContain('review');
      expect(ids).not.toContain('codex-review'); // codex not connected
    });

    it('shows skills from every connected provider, agnostic ones once', async () => {
      const stubs = configure({
        activeChat: makeChat(),
        streaming: false,
        skills: byProvider,
        workspace: { id: 'ws-1', projectId: 'proj-1' },
      });
      // Both providers connected → both scopes contribute.
      stubs.connectedAgentProvidersSignal.set(['claude_cli', 'codex']);
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });
      await stubs.skillsStore.refresh('claude_cli', 'proj-1');
      await stubs.skillsStore.refresh('codex', 'proj-1');
      fixture.detectChanges();

      const cmp = fixture.componentInstance as unknown as {
        skillGroups: () => readonly SkillGroupVm[];
      };
      const groups = cmp.skillGroups();
      expect(groups.map((g) => g.label)).toEqual(['Mozart', 'Claude', 'Codex']);
      const ids = groups.flatMap((g) => g.items.map((i) => i.id));
      expect(ids).toContain('review'); // claude
      expect(ids).toContain('codex-review'); // codex
      // Agnostic Mozart skill is discovered in both scans but shown once.
      expect(ids.filter((id) => id === 'commit')).toEqual(['commit']);
    });

    it('shows no skills before discovery resolves (empty cache)', () => {
      const stubs = configure({
        activeChat: makeChat(),
        streaming: false,
        workspace: { id: 'ws-1', projectId: 'proj-1' },
      });
      const fixture = mountComposer({
        workspaceId: 'ws-1',
        activeTabKind: 'chat',
      });
      const cmp = fixture.componentInstance as unknown as {
        skillGroups: () => readonly SkillGroupVm[];
      };
      // Default port returns []; nothing populated synchronously.
      expect(cmp.skillGroups()).toEqual([]);
      expect(stubs.skillsStore.skillsFor('claude_cli', 'proj-1')).toEqual([]);
    });
  });
});
