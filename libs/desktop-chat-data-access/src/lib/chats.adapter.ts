import { InjectionToken } from '@angular/core';
import type { TurnState } from '@mozart/desktop-llm-model-util';
import type {
  Chat,
  ChatMode,
  EffortLevel,
  Message,
  MessageStatus,
  SetupProgress,
} from '@mozart/desktop-chat-util';

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
  updateMode(chatId: string, mode: ChatMode): Promise<void>;
  updateEffort(chatId: string, effort: EffortLevel): Promise<void>;
  updateModel(chatId: string, modelId: string): Promise<void>;
  markRead(chatId: string, messageId: string): Promise<void>;
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
    mode: ChatMode | null;
    status: MessageStatus;
    runId?: string | null;
    turnState?: TurnState | null;
  }): Promise<Message>;
  updateContent(messageId: string, content: string): Promise<void>;
  updateStatus(messageId: string, status: MessageStatus): Promise<void>;
  // Persists the turn state as JSON on the DB column `timeline_json`
  // (column name retained for backwards compat with migration 004).
  updateTurnState(messageId: string, turnState: TurnState | null): Promise<void>;
  // Replaces `timeline_json` with a `setup_progress` payload. Used by
  // AddProjectFlow to flip the bootstrap setup entry to done / failed
  // once `runInstall` resolves (P0.3 / R0.3.E).
  updateSetupProgress(
    messageId: string,
    progress: SetupProgress,
  ): Promise<void>;
}

export const CHATS_ADAPTER = new InjectionToken<ChatsAdapter>('CHATS_ADAPTER');
export const MESSAGES_ADAPTER = new InjectionToken<MessagesAdapter>(
  'MESSAGES_ADAPTER',
);
