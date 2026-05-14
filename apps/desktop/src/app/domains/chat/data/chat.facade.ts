import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import type { TimelineTurn } from '@mozart/ui/timeline';
import { LLM_ADAPTER, type LlmRunHandle } from '../../llm-model';
import { applyAgentEvent } from './agent-stream-parser';
import {
  CHATS_ADAPTER,
  MESSAGES_ADAPTER,
} from './chats.adapter';
import type { Chat } from './chat.model';
import type { Message, MessageStatus } from './message.model';
import { ChatStore } from './chat.store';

const EMPTY_TURN: TimelineTurn = {
  summary: '',
  isStreaming: true,
  items: [],
  showDoneMarker: false,
};

// Minimum gap between non-text agent events for the fake adapter's
// pacing. The Tauri adapter delivers real-time events; the parser
// uses `event.kind !== 'text'` to apply the gate, so real streams
// only pace on tool_call/status, which is desired.
const MIN_STEP_GAP_MS = 180;

// Streaming-content updates are buffered and flushed at most every
// 200ms (plus once on terminal status). Keeps SQLite write rate bounded
// even on fast token streams.
const STREAM_FLUSH_MS = 200;

// Public API of the `chat` domain. Features inject this — never the
// store directly. Owns the streaming lifecycle + persistence:
//   - hydrate(workspaceId) loads chats + active-chat's messages;
//   - sendUserMessage(...) inserts a user bubble, persists it, runs an
//     assistant turn;
//   - sending a second message while the first is still streaming
//     QUEUES it (status='queued') instead of cancelling.
@Injectable({ providedIn: 'root' })
export class ChatFacade {
  private readonly store = inject(ChatStore);
  private readonly llm = inject(LLM_ADAPTER);
  private readonly chats = inject(CHATS_ADAPTER);
  private readonly messages = inject(MESSAGES_ADAPTER);

  // assistant-message-id -> handle of the in-flight run.
  private readonly activeRuns = new Map<string, LlmRunHandle>();
  // workspaceId -> assistant message id of the in-flight run.
  // Backed by a signal so consumers (sidebar workspace rows, etc.) get
  // reactive updates when a run starts or ends. The map itself is
  // replaced wholesale on every mutation — small (<= number of open
  // workspaces in flight) so the copy is cheap.
  private readonly activeByWorkspace = signal<ReadonlyMap<string, string>>(
    new Map(),
  );
  // per-message debounced content flush state.
  private readonly pendingFlush = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> | null; lastSent: string }
  >();
  // workspaces whose chats have already been hydrated this session.
  private readonly hydrated = new Set<string>();

  readonly chatByWorkspace = this.store.chatByWorkspace;
  // All open chats across every workspace, newest first. Sidebar
  // chat-list reads this to render its day-bucketed group.
  readonly allChats = this.store.allChatsSorted;

  // workspaceId -> ms timestamp of the latest message in any of its
  // chats. Drives the sidebar hover popover's relative-time string so
  // it reflects the workspace's most recent activity, not its
  // creation date. Bumped on every persisted message.
  private readonly _lastActivityByWorkspace = signal<
    ReadonlyMap<string, number>
  >(new Map());
  readonly lastActivityByWorkspace = this._lastActivityByWorkspace.asReadonly();

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

  isStreaming(workspaceId: Signal<string | null>): Signal<boolean> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return false;
      return this.activeByWorkspace().has(id);
    });
  }

  // Set of workspace ids whose chat is currently streaming. Sidebar
  // workspace rows derive their cli-loader / branch-icon state from
  // this — `set.has(id)` cheaper than a per-id computed at the leaf.
  readonly streamingWorkspaceIds = computed<ReadonlySet<string>>(
    () => new Set(this.activeByWorkspace().keys()),
  );

  // Idempotent — kept for FeatureChatPanel's effect, which calls this
  // on workspace input. Triggers hydration; the returned Chat may be a
  // synthetic placeholder until hydration completes.
  ensureChatForWorkspace(workspaceId: string): Chat {
    void this.hydrate(workspaceId);
    return this.store.ensureChat(workspaceId);
  }

  // Load every open chat across every workspace into the store. Called
  // once at boot (app.config.ts) so the sidebar Chats group has data
  // before the user opens any workspace. Subsequent chat creations
  // upsert into the same store via the normal hydrate/sendUserMessage
  // path, so the signal stays live without a re-fetch.
  async loadAllChats(): Promise<void> {
    try {
      const list = await this.chats.listAll();
      this.store.setAllChats(list);
    } catch (err) {
      console.warn('[chat] loadAllChats failed', err);
    }
  }

  // Hydrate chats + active-chat messages for a workspace from Tauri.
  // Idempotent per workspace per session.
  async hydrate(workspaceId: string): Promise<void> {
    if (this.hydrated.has(workspaceId)) return;
    this.hydrated.add(workspaceId);
    try {
      const list = await this.chats.listForWorkspace(workspaceId);
      let firstChat = list[0];
      if (!firstChat) {
        // No chat yet — create one so the user can immediately type.
        firstChat = await this.chats.create(workspaceId, 'Start');
      }
      this.store.setChatsForWorkspace(workspaceId, list.length > 0 ? list : [firstChat]);
      const msgs = await this.messages.listForChat(firstChat.id);
      this.store.setMessagesForChat(firstChat.id, msgs);
    } catch (err) {
      // Hydration failure shouldn't block the UI — log and let the
      // user retry by typing (the next sendUserMessage will create
      // the chat).
      console.warn('[chat] hydrate failed for workspace', workspaceId, err);
      this.hydrated.delete(workspaceId);
    }
  }

  async sendUserMessage(
    workspaceId: string,
    text: string,
    mode: 'normal' | 'plan',
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Lazy-create-or-replace the chat row. If `ensureChat` returned a
    // synthetic placeholder (no Tauri trip yet), upgrade it now.
    let chat = this.store.chatByWorkspace().get(workspaceId);
    if (!chat || chat.id.startsWith('pending-')) {
      const created = await this.chats.create(workspaceId, 'Start');
      if (chat) this.store.removeChat(chat.id); // drop placeholder
      this.store.upsertChat(created);
      chat = created;
    }

    // Streaming already? Queue this user message — it will be promoted
    // and processed once the current turn ends.
    if (this.activeByWorkspace().has(workspaceId)) {
      await this._persistAndAddMessage({
        chatId: chat.id,
        role: 'user',
        content: trimmed,
        mode,
        status: 'queued',
      });
      return;
    }

    await this._persistAndAddMessage({
      chatId: chat.id,
      role: 'user',
      content: trimmed,
      mode,
      status: 'done',
    });

    await this._runAssistantTurn(workspaceId, chat.id, mode);
  }

  cancelActive(workspaceId: string): void {
    const id = this.activeByWorkspace().get(workspaceId);
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
        void this.messages
          .updateStatus(msg.id, 'stopped')
          .catch((err) => console.warn('persist stopped status failed', err));
      }
    }
  }

  // ---- internals -----------------------------------------------------

  // Bump the workspace's lastActivity if `ms` is strictly newer than
  // what we have on file. Looking the chat -> workspace mapping up
  // from the store keeps the call site noise-free.
  private _bumpActivityForChat(chatId: string, ms: number): void {
    const chat = this.store.chats().find((c) => c.id === chatId);
    if (!chat) return;
    this._lastActivityByWorkspace.update((m) => {
      if ((m.get(chat.workspaceId) ?? 0) >= ms) return m;
      const next = new Map(m);
      next.set(chat.workspaceId, ms);
      return next;
    });
  }

  /**
   * Insert a message into the store immediately (optimistic) and persist
   * in parallel. On Tauri failure the optimistic row is marked 'error'.
   * Returns the created Message (with its client-generated id).
   */
  private async _persistAndAddMessage(input: {
    chatId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    mode: 'normal' | 'plan';
    status: MessageStatus;
    timeline?: TimelineTurn;
    runId?: string;
  }): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      mode: input.mode,
      status: input.status,
      createdAt: Date.now(),
      timeline: input.timeline,
    };
    this.store.addMessage(message);
    this._bumpActivityForChat(input.chatId, message.createdAt);
    try {
      await this.messages.insert({
        messageId: message.id,
        chatId: message.chatId,
        role: message.role,
        content: message.content,
        mode: message.mode ?? null,
        status: message.status,
        runId: input.runId ?? null,
        timeline: message.timeline ?? null,
      });
    } catch (err) {
      console.warn('[chat] persist message failed', err);
      this.store.updateMessage(message.id, (m) => ({ ...m, status: 'error' }));
    }
    return message;
  }

  /**
   * Buffer per-message content/status/timeline writes so a fast token
   * stream doesn't hammer SQLite. Flushes either after STREAM_FLUSH_MS
   * idle or on terminal-state.
   */
  private _scheduleContentFlush(messageId: string, content: string): void {
    const existing = this.pendingFlush.get(messageId);
    if (existing?.timer) clearTimeout(existing.timer);
    const lastSent = existing?.lastSent ?? '';
    if (content === lastSent) return;
    const timer = setTimeout(() => {
      this.pendingFlush.set(messageId, { timer: null, lastSent: content });
      void this.messages
        .updateContent(messageId, content)
        .catch((err) =>
          console.warn('persist message content failed', err),
        );
    }, STREAM_FLUSH_MS);
    this.pendingFlush.set(messageId, { timer, lastSent });
  }

  private _flushContentNow(messageId: string, content: string): void {
    const existing = this.pendingFlush.get(messageId);
    if (existing?.timer) clearTimeout(existing.timer);
    this.pendingFlush.set(messageId, { timer: null, lastSent: content });
    void this.messages
      .updateContent(messageId, content)
      .catch((err) => console.warn('persist message content failed', err));
  }

  private async _runAssistantTurn(
    workspaceId: string,
    chatId: string,
    mode: 'normal' | 'plan',
  ): Promise<void> {
    const assistantMsg = await this._persistAndAddMessage({
      chatId,
      role: 'assistant',
      content: '',
      mode,
      status: 'streaming',
      timeline: EMPTY_TURN,
    });

    const history = this.store.messagesByChat().get(chatId) ?? [];
    const handle = this.llm.stream({ workspaceId, history, mode });
    this.activeRuns.set(assistantMsg.id, handle);
    this.activeByWorkspace.update((m) => {
      const next = new Map(m);
      next.set(workspaceId, assistantMsg.id);
      return next;
    });

    let lastStepAt = 0;
    let lastContent = '';
    let lastTimeline: TimelineTurn | undefined = EMPTY_TURN;

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
        this.store.updateMessage(assistantMsg.id, (m) => {
          const next = applyAgentEvent(m, event);
          lastContent = next.content;
          lastTimeline = next.timeline;
          return next;
        });
        if (event.kind === 'text') {
          this._scheduleContentFlush(assistantMsg.id, lastContent);
        }
      }
    } catch (e) {
      const messageText = e instanceof Error ? e.message : String(e);
      this.store.updateMessage(assistantMsg.id, (m) => {
        const next = applyAgentEvent(m, {
          kind: 'error',
          message: messageText,
        });
        lastContent = next.content;
        lastTimeline = next.timeline;
        return next;
      });
    } finally {
      this.activeRuns.delete(assistantMsg.id);
      if (this.activeByWorkspace().get(workspaceId) === assistantMsg.id) {
        this.activeByWorkspace.update((m) => {
          const next = new Map(m);
          next.delete(workspaceId);
          return next;
        });
      }
      // Terminal flush: write content + status + timeline once, then
      // drain the queue.
      const finalMsg = (this.store.messagesByChat().get(chatId) ?? []).find(
        (m) => m.id === assistantMsg.id,
      );
      if (finalMsg) {
        this._flushContentNow(assistantMsg.id, finalMsg.content);
        void this.messages
          .updateStatus(assistantMsg.id, finalMsg.status)
          .catch((err) => console.warn('persist terminal status failed', err));
        void this.messages
          .updateTimeline(assistantMsg.id, finalMsg.timeline ?? null)
          .catch((err) => console.warn('persist timeline failed', err));
      } else {
        // Defensive: store row vanished. Write what we last saw.
        this._flushContentNow(assistantMsg.id, lastContent);
        void this.messages
          .updateTimeline(assistantMsg.id, lastTimeline ?? null)
          .catch(() => undefined);
      }
      void this._processQueue(workspaceId, chatId);
    }
  }

  private async _processQueue(
    workspaceId: string,
    chatId: string,
  ): Promise<void> {
    const messages = this.store.messagesByChat().get(chatId) ?? [];
    const queued = messages.find(
      (m) => m.status === 'queued' && m.role === 'user',
    );
    if (!queued) return;

    this.store.updateMessage(queued.id, (m) => ({ ...m, status: 'done' }));
    void this.messages
      .updateStatus(queued.id, 'done')
      .catch((err) => console.warn('persist queued promotion failed', err));
    await this._runAssistantTurn(workspaceId, chatId, queued.mode ?? 'normal');
  }
}
