import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Chat } from './chat.model';
import type { Message } from './message.model';

interface ChatStoreState {
  readonly chats: readonly Chat[];
  readonly messages: readonly Message[];
}

export const ChatStore = signalStore(
  { providedIn: 'root' },
  withState<ChatStoreState>({ chats: [], messages: [] }),
  withComputed(({ chats, messages }) => ({
    chatByWorkspace: computed(() => {
      // First chat per workspace (legacy 1:1 view). Multi-chat consumers
      // should iterate `chats()` and filter manually.
      const map = new Map<string, Chat>();
      for (const chat of chats()) {
        if (!map.has(chat.workspaceId)) map.set(chat.workspaceId, chat);
      }
      return map;
    }),
    chatsByWorkspace: computed(() => {
      const map = new Map<string, Chat[]>();
      for (const chat of chats()) {
        const list = map.get(chat.workspaceId) ?? [];
        list.push(chat);
        map.set(chat.workspaceId, list);
      }
      return map;
    }),
    // Every chat in the store, newest first. Backs the sidebar's Chats
    // group (renders all open chats across all workspaces, day-bucketed).
    allChatsSorted: computed(() =>
      [...chats()].sort((a, b) => b.createdAt - a.createdAt),
    ),
    messagesByChat: computed(() => {
      const map = new Map<string, Message[]>();
      for (const message of messages()) {
        const list = map.get(message.chatId) ?? [];
        list.push(message);
        map.set(message.chatId, list);
      }
      return map;
    }),
  })),
  withMethods((store) => ({
    /**
     * Idempotent "make sure a chat exists for this workspace" — returns
     * the existing chat if any, otherwise inserts a synthetic placeholder
     * with a temporary id. The facade is expected to immediately replace
     * the placeholder with the server row via `replaceChat` once
     * persistence resolves. Kept for back-compat with FeatureChatPanel
     * which currently calls `ensureChatForWorkspace(id)`.
     */
    ensureChat(workspaceId: string): Chat {
      const existing = store.chatByWorkspace().get(workspaceId);
      if (existing) return existing;
      const chat: Chat = {
        id: `pending-${crypto.randomUUID()}`,
        workspaceId,
        title: 'Start',
        modelId: null,
        mode: 'agent',
        effort: 'medium',
        lastReadMessageId: null,
        createdAt: Date.now(),
      };
      patchState(store, { chats: [...store.chats(), chat] });
      return chat;
    },
    patchChat(chatId: string, patch: Partial<Chat>): void {
      patchState(store, {
        chats: store
          .chats()
          .map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
      });
    },
    upsertChat(chat: Chat): void {
      const idx = store.chats().findIndex((c) => c.id === chat.id);
      if (idx === -1) {
        patchState(store, { chats: [...store.chats(), chat] });
      } else {
        patchState(store, {
          chats: store.chats().map((c, i) => (i === idx ? chat : c)),
        });
      }
    },
    removeChat(chatId: string): void {
      patchState(store, {
        chats: store.chats().filter((c) => c.id !== chatId),
        messages: store.messages().filter((m) => m.chatId !== chatId),
      });
    },
    /**
     * Replace the chats for a workspace with the canonical server set.
     * Preserves chats from other workspaces. Used by hydration.
     */
    setChatsForWorkspace(workspaceId: string, chats: readonly Chat[]): void {
      const kept = store.chats().filter((c) => c.workspaceId !== workspaceId);
      patchState(store, { chats: [...kept, ...chats] });
    },
    /**
     * Replace the entire chats list with the canonical server set.
     * Used by app-level hydration that lists every workspace's chats
     * up front (sidebar Chats group). Messages are preserved — the
     * existing message rows remain keyed by chatId and reattach when
     * the chats list reasserts.
     */
    setAllChats(allChats: readonly Chat[]): void {
      patchState(store, { chats: [...allChats] });
    },
    /**
     * Replace the messages for a chat. Preserves messages from other
     * chats. Used by hydration.
     */
    setMessagesForChat(chatId: string, messages: readonly Message[]): void {
      const kept = store.messages().filter((m) => m.chatId !== chatId);
      patchState(store, { messages: [...kept, ...messages] });
    },
    addMessage(message: Message): Message {
      patchState(store, { messages: [...store.messages(), message] });
      return message;
    },
    updateMessage(id: string, updater: (m: Message) => Message): void {
      patchState(store, {
        messages: store
          .messages()
          .map((m) => (m.id === id ? updater(m) : m)),
      });
    },
    removeMessage(id: string): void {
      patchState(store, {
        messages: store.messages().filter((m) => m.id !== id),
      });
    },
  })),
);
