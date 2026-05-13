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
      const map = new Map<string, Chat>();
      for (const chat of chats()) map.set(chat.workspaceId, chat);
      return map;
    }),
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
    ensureChat(workspaceId: string): Chat {
      const existing = store.chatByWorkspace().get(workspaceId);
      if (existing) return existing;
      const chat: Chat = {
        id: crypto.randomUUID(),
        workspaceId,
        createdAt: Date.now(),
      };
      patchState(store, { chats: [...store.chats(), chat] });
      return chat;
    },
    addMessage(input: Omit<Message, 'id' | 'createdAt'>): Message {
      const message: Message = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        ...input,
      };
      patchState(store, { messages: [...store.messages(), message] });
      return message;
    },
  })),
);
