import { Injectable, inject } from '@angular/core';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { WorkspacesFacade } from './workspace.facade';
import {
  WorkspaceTabRegistry,
  type WorkspaceTab,
} from './workspace-tab-registry';

export type WorkspaceTabResolution =
  | {
      readonly kind: 'resolved';
      readonly tab: WorkspaceTab;
    }
  | {
      readonly kind: 'redirect';
      readonly tabId: string;
    }
  | {
      readonly kind: 'not_found';
    };

@Injectable({ providedIn: 'root' })
export class WorkspaceTabResolver {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly chats = inject(ChatFacade);
  private readonly tabs = inject(WorkspaceTabRegistry);
  private readonly uiState = inject(UiStateFacade);

  async resolve(input: {
    projectId: string;
    workspaceId: string;
    tabId: string | null | undefined;
  }): Promise<WorkspaceTabResolution> {
    const workspace = this.workspaces.workspaceById(input.workspaceId)();
    if (!workspace || workspace.projectId !== input.projectId) {
      return { kind: 'not_found' };
    }

    const rawTabId = input.tabId;
    if (!rawTabId) {
      const fallback = await this.defaultTabId(input.workspaceId);
      if (!fallback) return { kind: 'not_found' };
      return { kind: 'redirect', tabId: fallback };
    }

    const parsed = this.tabs.parse(rawTabId);
    if (!parsed) {
      const fallback = await this.defaultTabId(input.workspaceId);
      if (!fallback) return { kind: 'not_found' };
      return { kind: 'redirect', tabId: fallback };
    }

    const allowed = await this.authorize(input.workspaceId, parsed);
    if (!allowed) {
      const fallback = await this.defaultTabId(input.workspaceId);
      if (!fallback) return { kind: 'not_found' };
      return { kind: 'redirect', tabId: fallback };
    }

    return {
      kind: 'resolved',
      tab: parsed,
    };
  }

  private async authorize(
    workspaceId: string,
    tab: WorkspaceTab,
  ): Promise<boolean> {
    if (tab.kind === 'file') return true;

    if (tab.kind === 'chat') {
      await this.chats.hydrate(workspaceId);
      const chats = this.chats.chatsByWorkspace().get(workspaceId) ?? [];
      return chats.some((chat) => chat.id === tab.chatId);
    }

    // Reserved typed tab kinds. Keep parsing support, but route them
    // to default chat until dedicated tab surfaces land.
    return false;
  }

  // Choose where to land when the URL has no tab segment. Preference
  // order:
  //   1. Persisted last-active tab id (chat OR file) for this workspace,
  //      if it still parses and `authorize` passes. For file kinds we
  //      trust the URL — if the path was deleted offline, the
  //      `FeatureFileContent` "Couldn't open file" banner is the UX.
  //   2. The chat facade's currently-active chat id.
  //   3. The first chat in the workspace.
  //   4. A freshly-seeded default chat.
  private async defaultTabId(workspaceId: string): Promise<string | null> {
    const stored = this.uiState.lastActiveTabIdFor(workspaceId);
    if (stored) {
      const parsed = this.tabs.parse(stored);
      if (parsed) {
        const allowed = await this.authorize(workspaceId, parsed);
        if (allowed) return stored;
      }
    }

    try {
      await this.chats.hydrate(workspaceId);
    } catch {
      // Fall through to local store checks.
    }

    const active = this.chats.activeChatIdFor(workspaceId);
    if (active) return this.tabs.chatTabId(active);

    const first = this.chats.chatsByWorkspace().get(workspaceId)?.[0];
    if (first) return this.tabs.chatTabId(first.id);

    const seeded = this.chats.ensureChatForWorkspace(workspaceId);
    return seeded?.id ? this.tabs.chatTabId(seeded.id) : null;
  }
}
