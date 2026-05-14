import { InjectionToken } from '@angular/core';
import type { Chat } from './chat.model';
import type { Message, MessageStatus } from './message.model';
import type { TimelineTurn } from '@mozart/ui/timeline';

// Tauri-backed IO for the chat domain. Concrete impl bound in
// app.config.ts. Two interfaces — chats vs messages — bound under the
// same token because they share the persistence backend and most
// features need both. The split keeps the adapter readable.

export interface ChatsAdapter {
  listForWorkspace(workspaceId: string): Promise<Chat[]>;
  // All open chats across every workspace, newest-first. Backs the
  // sidebar "Chats" group introduced in Phase 1.
  listAll(): Promise<Chat[]>;
  create(workspaceId: string, title: string): Promise<Chat>;
  rename(chatId: string, title: string): Promise<void>;
  close(chatId: string): Promise<void>;
  getActive(workspaceId: string): Promise<string | null>;
  setActive(workspaceId: string, chatId: string): Promise<void>;
}

export interface MessagesAdapter {
  listForChat(chatId: string): Promise<Message[]>;
  // Insert with a client-generated id so optimistic UI doesn't have to
  // wait for the round-trip to know which row was created.
  insert(input: {
    messageId: string;
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    mode: 'normal' | 'plan' | null;
    status: MessageStatus;
    runId?: string | null;
    timeline?: TimelineTurn | null;
  }): Promise<Message>;
  updateContent(messageId: string, content: string): Promise<void>;
  updateStatus(messageId: string, status: MessageStatus): Promise<void>;
  updateTimeline(messageId: string, timeline: TimelineTurn | null): Promise<void>;
}

export const CHATS_ADAPTER = new InjectionToken<ChatsAdapter>('CHATS_ADAPTER');
export const MESSAGES_ADAPTER = new InjectionToken<MessagesAdapter>(
  'MESSAGES_ADAPTER',
);
