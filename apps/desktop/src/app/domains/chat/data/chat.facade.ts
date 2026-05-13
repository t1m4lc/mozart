import { Injectable, Signal, computed, inject } from '@angular/core';
import type { Chat } from './chat.model';
import type { Message } from './message.model';
import { ChatStore } from './chat.store';

// Public API of the `chat` domain. Features inject this — never the
// store directly. Stays a thin orchestrator until SQLite + the Tauri
// adapter land, at which point the persistence path is added inside
// `sendUserMessage` without changing the signature.
@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private readonly store = inject(ChatStore);

  readonly chatByWorkspace = this.store.chatByWorkspace;

  messagesForWorkspace(
    workspaceId: Signal<string | null>,
  ): Signal<readonly Message[]> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return [];
      const chat = this.store.chatByWorkspace().get(id);
      if (!chat) return [];
      return this.store.messagesByChat().get(chat.id) ?? [];
    });
  }

  ensureChatForWorkspace(workspaceId: string): Chat {
    return this.store.ensureChat(workspaceId);
  }

  sendUserMessage(
    workspaceId: string,
    text: string,
    mode: 'normal' | 'plan',
  ): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const chat = this.store.ensureChat(workspaceId);
    this.store.addMessage({
      chatId: chat.id,
      role: 'user',
      content: trimmed,
      mode,
      status: 'done',
    });
  }
}
