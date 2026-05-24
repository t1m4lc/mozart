import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkspacesFacade } from './workspace.facade';
import { WorkspaceTabRegistry } from './workspace-tab-registry';
import { WorkspaceTabResolver } from './workspace-tab-resolver.service';

// Resolver redirect logic. Covers R6: last-active tab restoration on
// workspace re-navigation (no explicit tab segment).

const projectA = 'project-a';
const wsA = 'workspace-a';

function workspaceFacadeFake() {
  return {
    workspaceById: vi.fn(() => () => ({ projectId: projectA })),
  } as unknown as WorkspacesFacade;
}

function chatFacadeFake(opts: {
  chats?: { id: string; workspaceId: string; title: string }[];
  activeChatId?: string;
}) {
  const chats = opts.chats ?? [];
  return {
    hydrate: vi.fn().mockResolvedValue(undefined),
    chatsByWorkspace: vi.fn(() => new Map([[wsA, chats]])),
    activeChatIdFor: vi.fn(() => opts.activeChatId ?? null),
    ensureChatForWorkspace: vi.fn(() => ({ id: 'seeded-chat' })),
  } as unknown as ChatFacade;
}

function uiStateFake(lastActive: string | null) {
  return {
    lastActiveTabIdFor: vi.fn(() => lastActive),
  } as unknown as UiStateFacade;
}

function setup(
  workspace: WorkspacesFacade,
  chat: ChatFacade,
  uiState: UiStateFacade,
): WorkspaceTabResolver {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: WorkspacesFacade, useValue: workspace },
      { provide: ChatFacade, useValue: chat },
      { provide: UiStateFacade, useValue: uiState },
      WorkspaceTabRegistry,
    ],
  });
  return TestBed.inject(WorkspaceTabResolver);
}

describe('WorkspaceTabResolver — defaultTabId (R6 last-active)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('R6: returns persisted last-active file tab on workspace re-navigation', async () => {
    const registry = new WorkspaceTabRegistry();
    const fileTabId = registry.fileTabId('src/restored.ts');
    expect(fileTabId).not.toBeNull();

    const resolver = setup(
      workspaceFacadeFake(),
      chatFacadeFake({}),
      uiStateFake(fileTabId),
    );

    const result = await resolver.resolve({
      projectId: projectA,
      workspaceId: wsA,
      tabId: null,
    });

    expect(result.kind).toBe('redirect');
    if (result.kind === 'redirect') {
      expect(result.tabId).toBe(fileTabId);
    }
  });

  it('R6: returns persisted last-active chat tab when valid', async () => {
    const resolver = setup(
      workspaceFacadeFake(),
      chatFacadeFake({
        chats: [{ id: 'chat-1', workspaceId: wsA, title: 'My chat' }],
      }),
      uiStateFake('chat:chat-1'),
    );

    const result = await resolver.resolve({
      projectId: projectA,
      workspaceId: wsA,
      tabId: null,
    });

    expect(result.kind).toBe('redirect');
    if (result.kind === 'redirect') {
      expect(result.tabId).toBe('chat:chat-1');
    }
  });

  it('falls back to active chat when last-active chat no longer exists', async () => {
    const resolver = setup(
      workspaceFacadeFake(),
      chatFacadeFake({
        chats: [{ id: 'chat-other', workspaceId: wsA, title: 'Other' }],
        activeChatId: 'chat-other',
      }),
      uiStateFake('chat:nonexistent-chat'),
    );

    const result = await resolver.resolve({
      projectId: projectA,
      workspaceId: wsA,
      tabId: null,
    });

    expect(result.kind).toBe('redirect');
    if (result.kind === 'redirect') {
      expect(result.tabId).toBe('chat:chat-other');
    }
  });

  it('falls back to chat default when no last-active stored', async () => {
    const resolver = setup(
      workspaceFacadeFake(),
      chatFacadeFake({
        chats: [{ id: 'chat-only', workspaceId: wsA, title: 'Only' }],
        activeChatId: 'chat-only',
      }),
      uiStateFake(null),
    );

    const result = await resolver.resolve({
      projectId: projectA,
      workspaceId: wsA,
      tabId: null,
    });

    expect(result.kind).toBe('redirect');
    if (result.kind === 'redirect') {
      expect(result.tabId).toBe('chat:chat-only');
    }
  });

  it('falls back when last-active fails to parse', async () => {
    const resolver = setup(
      workspaceFacadeFake(),
      chatFacadeFake({
        chats: [{ id: 'fallback', workspaceId: wsA, title: 'Fallback' }],
        activeChatId: 'fallback',
      }),
      uiStateFake('not-a-valid-tab-id'),
    );

    const result = await resolver.resolve({
      projectId: projectA,
      workspaceId: wsA,
      tabId: null,
    });

    expect(result.kind).toBe('redirect');
    if (result.kind === 'redirect') {
      expect(result.tabId).toBe('chat:fallback');
    }
  });
});
