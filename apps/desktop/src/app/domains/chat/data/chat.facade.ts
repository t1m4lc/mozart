import { Injectable, Signal, computed, inject } from '@angular/core';
import type { TimelineTurn } from '@mozart/ui/timeline';
import { LLM_ADAPTER, type LlmRunHandle } from '../../llm-model';
import { applyAgentEvent } from './agent-stream-parser';
import type { Chat } from './chat.model';
import type { Message } from './message.model';
import { ChatStore } from './chat.store';

const EMPTY_TURN: TimelineTurn = {
  summary: '',
  isStreaming: true,
  items: [],
  showDoneMarker: false,
};

const MIN_STEP_GAP_MS = 180;

// Public API of the `chat` domain. Features inject this — never the
// store directly. Owns the streaming lifecycle :
//   - sendUserMessage(...) adds the user bubble and runs an assistant
//     turn ;
//   - sending a second message while the first is still streaming
//     QUEUES it (status='queued') instead of cancelling — once the
//     current turn ends, the queue is drained FIFO.
@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private readonly store = inject(ChatStore);
  private readonly adapter = inject(LLM_ADAPTER);

  // assistant-message-id -> handle of the in-flight run.
  private readonly activeRuns = new Map<string, LlmRunHandle>();
  // workspaceId -> assistant message id of the in-flight run.
  private readonly activeByWorkspace = new Map<string, string>();

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

  async sendUserMessage(
    workspaceId: string,
    text: string,
    mode: 'normal' | 'plan',
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    const chat = this.store.ensureChat(workspaceId);

    // Streaming already ? Queue this user message — it will be
    // promoted and processed once the current turn ends.
    if (this.activeByWorkspace.has(workspaceId)) {
      this.store.addMessage({
        chatId: chat.id,
        role: 'user',
        content: trimmed,
        mode,
        status: 'queued',
      });
      return;
    }

    this.store.addMessage({
      chatId: chat.id,
      role: 'user',
      content: trimmed,
      mode,
      status: 'done',
    });

    await this._runAssistantTurn(workspaceId, mode);
  }

  cancelActive(workspaceId: string): void {
    const id = this.activeByWorkspace.get(workspaceId);
    if (id) {
      const handle = this.activeRuns.get(id);
      if (handle) handle.cancel();
    }
    // Stop also drops any queued user messages — user intent is
    // "halt all activity in this workspace".
    const chat = this.store.chatByWorkspace().get(workspaceId);
    if (!chat) return;
    const messages = this.store.messagesByChat().get(chat.id) ?? [];
    for (const msg of messages) {
      if (msg.status === 'queued') {
        this.store.updateMessage(msg.id, (m) => ({ ...m, status: 'stopped' }));
      }
    }
  }

  isStreaming(workspaceId: Signal<string | null>): Signal<boolean> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return false;
      return this.activeByWorkspace.has(id);
    });
  }

  private async _runAssistantTurn(
    workspaceId: string,
    mode: 'normal' | 'plan',
  ): Promise<void> {
    const chat = this.store.ensureChat(workspaceId);
    const assistantMsg = this.store.addMessage({
      chatId: chat.id,
      role: 'assistant',
      content: '',
      mode,
      status: 'streaming',
      timeline: EMPTY_TURN,
    });

    const history = this.store.messagesByChat().get(chat.id) ?? [];
    const handle = this.adapter.stream({ workspaceId, history, mode });
    this.activeRuns.set(assistantMsg.id, handle);
    this.activeByWorkspace.set(workspaceId, assistantMsg.id);

    let lastStepAt = 0;

    try {
      for await (const event of handle.events$) {
        if (
          event.kind !== 'text' &&
          event.kind !== 'done' &&
          event.kind !== 'stopped'
        ) {
          const elapsed = Date.now() - lastStepAt;
          if (elapsed < MIN_STEP_GAP_MS) {
            await new Promise((resolve) =>
              setTimeout(resolve, MIN_STEP_GAP_MS - elapsed),
            );
          }
          lastStepAt = Date.now();
        }
        this.store.updateMessage(assistantMsg.id, (m) =>
          applyAgentEvent(m, event),
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.store.updateMessage(assistantMsg.id, (m) =>
        applyAgentEvent(m, { kind: 'error', message }),
      );
    } finally {
      this.activeRuns.delete(assistantMsg.id);
      if (this.activeByWorkspace.get(workspaceId) === assistantMsg.id) {
        this.activeByWorkspace.delete(workspaceId);
      }
      // Drain the queue (FIFO).
      void this._processQueue(workspaceId);
    }
  }

  private async _processQueue(workspaceId: string): Promise<void> {
    const chat = this.store.chatByWorkspace().get(workspaceId);
    if (!chat) return;
    const messages = this.store.messagesByChat().get(chat.id) ?? [];
    const queued = messages.find(
      (m) => m.status === 'queued' && m.role === 'user',
    );
    if (!queued) return;

    this.store.updateMessage(queued.id, (m) => ({ ...m, status: 'done' }));
    await this._runAssistantTurn(workspaceId, queued.mode ?? 'normal');
  }
}
