import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import {
  NotificationService,
  WindowFocusService,
} from '@mozart/desktop-core-data-access';
import {
  LLM_ADAPTER,
  type LlmRunHandle,
} from '@mozart/desktop-llm-model-data-access';
import {
  EMPTY_TURN_STATE,
  applyAgentEvent,
  type TurnOutcome,
  type TurnState,
} from '@mozart/desktop-llm-model-util';
import {
  CHAT_TAB_CAP,
  type Chat,
  type ChatMode,
  type EffortLevel,
  type Message,
  type MessageStatus,
  type SetupProgress,
  type SetupProgressStatus,
} from '@mozart/desktop-chat-util';
import { CHATS_ADAPTER, MESSAGES_ADAPTER } from './chats.adapter';
import { ChatStore } from './chat.store';
import { WorkspaceChatPort } from './workspace-chat.port';

function outcomeToStatus(
  outcome: TurnOutcome | undefined,
): MessageStatus | undefined {
  if (outcome === 'done') return 'done';
  if (outcome === 'stopped') return 'stopped';
  if (outcome === 'error') return 'error';
  return undefined;
}

function firstLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const newline = trimmed.indexOf('\n');
  const line = newline === -1 ? trimmed : trimmed.slice(0, newline);
  return line.length > 80 ? line.slice(0, 77) + '…' : line;
}

/**
 * Pure decision for what to surface when an agent turn ends.
 *
 * - `sound-only`: user is already looking at the workspace, so the
 *   chime is enough.
 *  - `popup-and-sound`: user is off-screen or on a different workspace,
 *   so we want the desktop notification, the unread flag, and the
 *   chime that `NotificationService.notify` plays internally.
 *
 * Exported so the trigger condition is unit-testable without touching
 * the streaming machinery. The caller is still responsible for
 * checking the user-facing `desktop` / `sound` preferences via
 * `NotificationService` — this function only decides the surface, not
 * whether the surface is enabled.
 */
export type TurnEndNotificationDecision = 'sound-only' | 'popup-and-sound';

export function decideTurnEndNotification(input: {
  readonly focused: boolean;
  readonly isActiveWorkspace: boolean;
}): TurnEndNotificationDecision {
  return input.focused && input.isActiveWorkspace
    ? 'sound-only'
    : 'popup-and-sound';
}

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
  private readonly workspaces = inject(WorkspaceChatPort);
  private readonly windowFocus = inject(WindowFocusService);
  private readonly notify = inject(NotificationService);

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
  readonly chatsByWorkspace = this.store.chatsByWorkspace;
  readonly messagesByChat = this.store.messagesByChat;
  // All open chats across every workspace, newest first. Sidebar
  // chat-list reads this to render its day-bucketed group.
  readonly allChats = this.store.allChatsSorted;

  // workspaceId -> chatId, mirrors `workspace_active_chat` table. Lazily
  // hydrated per-workspace via `setActiveChat` or first hydrate().
  private readonly _activeChatByWorkspace = signal<ReadonlyMap<string, string>>(
    new Map(),
  );

  /** Set of chatIds that currently have a streaming assistant message.
   * Derived from the messages store — the WorkspaceTabBar feature uses
   * it to swap the LLM icon for a loader per tab. */
  readonly streamingChatIds = computed<ReadonlySet<string>>(() => {
    const out = new Set<string>();
    for (const m of this.store.messages()) {
      if (m.status === 'streaming') out.add(m.chatId);
    }
    return out;
  });

  activeChatIdFor(workspaceId: string | null): string | null {
    if (!workspaceId) return null;
    return this._activeChatByWorkspace().get(workspaceId) ?? null;
  }

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
      const activeId = this._activeChatByWorkspace().get(id);
      const fallback = this.store.chatByWorkspace().get(id);
      const chatId = activeId ?? fallback?.id;
      if (!chatId) return [];
      return this.store.messagesByChat().get(chatId) ?? [];
    });
  }

  /** The currently-active chat for the workspace, or null. */
  activeChatFor(workspaceId: string | null): Chat | null {
    if (!workspaceId) return null;
    const activeId = this._activeChatByWorkspace().get(workspaceId);
    if (activeId) {
      const found = this.store.chats().find((c) => c.id === activeId);
      if (found) return found;
    }
    return this.store.chatByWorkspace().get(workspaceId) ?? null;
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

  // Idempotent — called by `WorkspaceDetailPage`'s workspace-id
  // effect (fires before any tab renders, so the composer can send
  // even when the user lands on a file tab first). Triggers
  // hydration ; the returned Chat may be a synthetic placeholder
  // until hydration completes.
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
      this.store.setChatsForWorkspace(
        workspaceId,
        list.length > 0 ? list : [firstChat],
      );

      const persisted = await this.chats.getActive(workspaceId);
      const activeId =
        persisted && list.some((c) => c.id === persisted)
          ? persisted
          : firstChat.id;
      this._setActiveLocal(workspaceId, activeId);

      const msgs = await this.messages.listForChat(activeId);
      // Phase 6 / Atom 9 — interrupted-message recovery. Any assistant
      // message still in `streaming` here means the app was killed
      // mid-turn (or the OS crashed) ; flip it to `error` so the user
      // sees the failure surfaced. DB-backed via updateStatus so the
      // flip survives a second restart.
      const recovered = await Promise.all(
        msgs.map(async (m) => {
          if (m.status !== 'streaming') return m;
          try {
            await this.messages.updateStatus(m.id, 'error');
          } catch (err) {
            console.warn('[chat] interrupted-message flip failed:', err);
          }
          return { ...m, status: 'error' as const };
        }),
      );
      this.store.setMessagesForChat(activeId, recovered);
    } catch (err) {
      // Hydration failure shouldn't block the UI — log and let the
      // user retry by typing (the next sendUserMessage will create
      // the chat).
      console.warn('[chat] hydrate failed for workspace', workspaceId, err);
      this.hydrated.delete(workspaceId);
    }
  }

  /**
   * Update a bootstrap `setup_progress` chat-timeline entry (P0.3 /
   * R0.3.E). Persists the new payload via the existing
   * `update_message_timeline` Tauri command and patches the in-memory
   * message so the renderer reflects the new state on the next tick.
   *
   * No-op when the target message isn't in the store yet — the next
   * `hydrate()` will pick the persisted state up.
   */
  async setSetupProgress(
    messageId: string,
    status: SetupProgressStatus,
    options: {
      command?: string;
      manager?: string;
      errorMessage?: string;
    } = {},
  ): Promise<void> {
    const existing = this.store.messages().find((m) => m.id === messageId);
    const command = options.command ?? existing?.setupProgress?.command ?? '';
    const manager = options.manager ?? existing?.setupProgress?.manager;
    const payload: SetupProgress = {
      kind: 'setup_progress',
      status,
      command,
      ...(manager ? { manager } : {}),
      ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
    };
    try {
      await this.messages.updateSetupProgress(messageId, payload);
    } catch (err) {
      console.warn('[chat] setSetupProgress persist failed', messageId, err);
      return;
    }
    if (existing) {
      this.store.updateMessage(messageId, (m) => ({
        ...m,
        setupProgress: payload,
      }));
    }
  }

  /**
   * Create a new chat for the workspace, upsert it into the store, and
   * make it active. Honors the per-workspace MAX cap (4 chats) by
   * silently no-op when the cap is hit — the dumb tab bar already hides
   * the `+` button at the cap, so this is defensive.
   */
  async createChat(
    workspaceId: string,
    title = 'Untitled',
  ): Promise<Chat | null> {
    const existing = this.store.chatsByWorkspace().get(workspaceId) ?? [];
    if (existing.length >= CHAT_TAB_CAP) return null;
    try {
      const chat = await this.chats.create(workspaceId, title);
      this.store.upsertChat(chat);
      await this.setActiveChat(workspaceId, chat.id);
      return chat;
    } catch (err) {
      console.warn('[chat] createChat failed', err);
      return null;
    }
  }

  async closeChat(chatId: string): Promise<void> {
    const chats = this.store.chats();
    const target = chats.find((c) => c.id === chatId);
    if (!target) return;
    const siblings = (
      this.store.chatsByWorkspace().get(target.workspaceId) ?? []
    ).filter((c) => c.id !== chatId);
    this.store.removeChat(chatId);
    if (this.activeChatIdFor(target.workspaceId) === chatId) {
      const fallback = siblings[0];
      if (fallback) {
        await this.setActiveChat(target.workspaceId, fallback.id);
      } else {
        this._clearActiveLocal(target.workspaceId);
      }
    }
    try {
      await this.chats.close(chatId);
    } catch (err) {
      console.warn('[chat] closeChat failed', err);
    }
  }

  async renameChat(chatId: string, title: string): Promise<void> {
    const next = title.trim();
    if (!next) return;
    this.store.patchChat(chatId, { title: next });
    try {
      await this.chats.rename(chatId, next);
    } catch (err) {
      console.warn('[chat] renameChat failed', err);
    }
  }

  async setActiveChat(workspaceId: string, chatId: string): Promise<void> {
    // Viewing any chat in a workspace clears that workspace's unread
    // flag. Fire-and-forget — covers the case where the user is
    // already on the workspace route and just clicks a different chat
    // tab, which wouldn't trigger workspace navigation.
    void this.workspaces.markRead(workspaceId).catch((err) => {
      console.warn('[chat] markRead failed', err);
    });
    if (this.activeChatIdFor(workspaceId) === chatId) return;
    this._setActiveLocal(workspaceId, chatId);
    // Lazy-hydrate this chat's messages if we don't have them yet.
    const have = this.store.messagesByChat().has(chatId);
    if (!have) {
      try {
        const msgs = await this.messages.listForChat(chatId);
        this.store.setMessagesForChat(chatId, msgs);
      } catch (err) {
        console.warn('[chat] setActiveChat messages-load failed', err);
      }
    }
    try {
      await this.chats.setActive(workspaceId, chatId);
    } catch (err) {
      console.warn('[chat] setActiveChat persist failed', err);
    }
  }

  private _setActiveLocal(workspaceId: string, chatId: string): void {
    this._activeChatByWorkspace.update((m) => {
      if (m.get(workspaceId) === chatId) return m;
      const next = new Map(m);
      next.set(workspaceId, chatId);
      return next;
    });
  }

  private _clearActiveLocal(workspaceId: string): void {
    this._activeChatByWorkspace.update((m) => {
      if (!m.has(workspaceId)) return m;
      const next = new Map(m);
      next.delete(workspaceId);
      return next;
    });
  }

  async sendUserMessage(
    workspaceId: string,
    text: string,
    mode: ChatMode,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Target the currently-active chat, falling back to the first chat
    // for the workspace. Lazy-create-or-replace if the active row is a
    // synthetic placeholder (no Tauri trip yet).
    let chat = this.activeChatFor(workspaceId);
    if (!chat || chat.id.startsWith('pending-')) {
      const created = await this.chats.create(workspaceId, 'Start');
      if (chat) this.store.removeChat(chat.id); // drop placeholder
      this.store.upsertChat(created);
      this._setActiveLocal(workspaceId, created.id);
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

    const userMsg = await this._persistAndAddMessage({
      chatId: chat.id,
      role: 'user',
      content: trimmed,
      mode,
      status: 'done',
    });

    await this._runAssistantTurn(workspaceId, chat.id, mode, userMsg.id);
  }

  cancelActive(workspaceId: string): void {
    const id = this.activeByWorkspace().get(workspaceId);
    if (id) {
      const handle = this.activeRuns.get(id);
      if (handle) handle.cancel();
    }
    // Stop also drops any queued user messages — user intent is
    // "halt all activity in this workspace".
    const chat = this.activeChatFor(workspaceId);
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
    mode: ChatMode;
    status: MessageStatus;
    turnState?: TurnState;
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
      turnState: input.turnState,
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
        turnState: message.turnState ?? null,
      });
    } catch (err) {
      console.warn('[chat] persist message failed', err);
      this.store.updateMessage(message.id, (m) => ({ ...m, status: 'error' }));
    }
    return message;
  }

  /**
   * Buffer per-message content/status/turn-state writes so a fast
   * token stream doesn't hammer SQLite. Flushes either after
   * STREAM_FLUSH_MS idle or on terminal-state.
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
        .catch((err) => console.warn('persist message content failed', err));
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
    mode: ChatMode,
    currentUserMessageId: string,
  ): Promise<void> {
    const startedAt = Date.now();
    const initialState = EMPTY_TURN_STATE(startedAt);
    const assistantMsg = await this._persistAndAddMessage({
      chatId,
      role: 'assistant',
      content: '',
      mode,
      status: 'streaming',
      turnState: initialState,
    });

    const handle = this.llm.stream({
      workspaceId,
      chatId,
      currentUserMessageId,
      mode,
    });
    this.activeRuns.set(assistantMsg.id, handle);
    this.activeByWorkspace.update((m) => {
      const next = new Map(m);
      next.set(workspaceId, assistantMsg.id);
      return next;
    });

    let lastStepAt = 0;
    let lastContent = '';
    let lastTurnState: TurnState = initialState;

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
          const prevState = m.turnState ?? EMPTY_TURN_STATE(m.createdAt);
          const nextState = applyAgentEvent(prevState, event);
          lastContent = nextState.text;
          lastTurnState = nextState;
          return {
            ...m,
            content: nextState.text,
            turnState: nextState,
            status: outcomeToStatus(nextState.outcome) ?? m.status,
          };
        });
        if (event.kind === 'text') {
          this._scheduleContentFlush(assistantMsg.id, lastContent);
        }
      }
    } catch (e) {
      const messageText = e instanceof Error ? e.message : String(e);
      this.store.updateMessage(assistantMsg.id, (m) => {
        const prevState = m.turnState ?? EMPTY_TURN_STATE(m.createdAt);
        const nextState = applyAgentEvent(prevState, {
          kind: 'error',
          message: messageText,
        });
        lastContent = nextState.text;
        lastTurnState = nextState;
        return {
          ...m,
          content: nextState.text,
          turnState: nextState,
          status: 'error' as const,
        };
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
      // Terminal flush: write content + status + turn state once,
      // then drain the queue.
      const finalMsg = (this.store.messagesByChat().get(chatId) ?? []).find(
        (m) => m.id === assistantMsg.id,
      );
      if (finalMsg) {
        this._flushContentNow(assistantMsg.id, finalMsg.content);
        void this.messages
          .updateStatus(assistantMsg.id, finalMsg.status)
          .catch((err) => console.warn('persist terminal status failed', err));
        void this.messages
          .updateTurnState(assistantMsg.id, finalMsg.turnState ?? null)
          .catch((err) => console.warn('persist turnState failed', err));
        if (finalMsg.status === 'done' || finalMsg.status === 'error') {
          this._maybeNotifyTurnEnd(workspaceId, finalMsg.content);
        }
      } else {
        // Defensive: store row vanished. Write what we last saw.
        this._flushContentNow(assistantMsg.id, lastContent);
        void this.messages
          .updateTurnState(assistantMsg.id, lastTurnState ?? null)
          .catch(() => undefined);
      }
      void this._processQueue(workspaceId, chatId);
    }
  }

  // On terminal `done` / `error`, the visual desktop popup + `unread`
  // flip are suppressed when the user is already focused on this
  // workspace — they're looking at the result, no extra cue needed.
  // The historical sound-only chime path was dropped (it required
  // GStreamer plugins on Linux); when the user is here, we now stay
  // fully silent. `stopped` is user-initiated so it's intentionally
  // not notified.
  private _maybeNotifyTurnEnd(workspaceId: string, content: string): void {
    const decision = decideTurnEndNotification({
      focused: this.windowFocus.isWindowFocused(),
      isActiveWorkspace: this.workspaces.activeId() === workspaceId,
    });

    if (decision === 'sound-only') return;

    const ws = this.workspaces.workspaceById(workspaceId)();
    if (ws && !ws.unread) {
      void this.workspaces.toggleUnread(workspaceId);
    }
    // The OS notification daemon plays the native sound when
    // prefs.sound is on — passed through by NotificationService.
    void this.notify.notify({
      title: ws?.name ?? 'Mozart',
      body: firstLine(content),
    });
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
    await this._runAssistantTurn(
      workspaceId,
      chatId,
      queued.mode ?? 'agent',
      queued.id,
    );
  }

  async setChatMode(chatId: string, mode: ChatMode): Promise<void> {
    this.store.patchChat(chatId, { mode });
    try {
      await this.chats.updateMode(chatId, mode);
    } catch (err) {
      console.warn('[chat] setChatMode failed', err);
    }
  }

  async setChatEffort(chatId: string, effort: EffortLevel): Promise<void> {
    this.store.patchChat(chatId, { effort });
    try {
      await this.chats.updateEffort(chatId, effort);
    } catch (err) {
      console.warn('[chat] setChatEffort failed', err);
    }
  }

  async setChatModel(chatId: string, modelId: string): Promise<void> {
    this.store.patchChat(chatId, { modelId });
    try {
      await this.chats.updateModel(chatId, modelId);
    } catch (err) {
      console.warn('[chat] setChatModel failed', err);
    }
  }

  async markChatRead(chatId: string, messageId: string): Promise<void> {
    this.store.patchChat(chatId, { lastReadMessageId: messageId });
    try {
      await this.chats.markRead(chatId, messageId);
    } catch (err) {
      console.warn('[chat] markChatRead failed', err);
    }
  }
}
