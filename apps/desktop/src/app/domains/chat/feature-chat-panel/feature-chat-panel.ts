import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  HlmComposer,
  type ChatMode,
  type ComposerSendEvent,
  type EffortLevel,
} from '@mozart-ui/composer';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
} from '../../llm-model';
import { WorkspacesFacade } from '../../workspaces';
import { ChatFacade } from '../data/chat.facade';
import { MessageList } from '../ui/message-list/message-list';

// Chat panel — composer pinned to the bottom, virtual-scrolling
// message list above. MessageList owns the viewport (CDK virtual
// scroll) and exposes `isAtBottom()` + `scrollToBottom()` for the
// autoFollow plumbing.
@Component({
  selector: 'app-feature-chat-panel',
  imports: [HlmComposer, MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
  template: `
    <div class="flex-1 min-h-0">
      @if (messages().length > 0) {
        <app-message-list #list [messages]="messages()" />
      } @else {
        <ng-content select="[chat-empty-state]" />
      }
    </div>

    <div class="relative px-4 pb-3 pt-0" data-tour="composer-mode">
      <!-- Soft fade where the scrolling content meets the composer.
           One absolute layer, pointer-events-none. Tight: 4px gradient
           so content disappears behind the composer's top edge instead
           of leaving a visible gap. -->
      <div
        class="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-background to-transparent dark:from-background"
        aria-hidden="true"
      ></div>
      <hlm-composer
        #composerEl
        [(value)]="value"
        [mode]="currentMode()"
        (modeChange)="onModeChange($event)"
        [effort]="currentEffort()"
        (effortChange)="onEffortChange($event)"
        [models]="catalog"
        [providers]="providers"
        [selectedModelId]="currentModelId()"
        (modelChange)="onModelChange($event)"
        [isRunning]="isStreaming()"
        [autoFollowChat]="autoFollowChat()"
        [hasNextUnreadInProject]="hasNextUnreadInProject()"
        (send)="onSend($event)"
        (stop)="onStop()"
        (scrollToBottom)="onScrollToBottom()"
        (nextUnreadWorkspace)="onNextUnreadWorkspace()"
      />
    </div>
  `,
})
export class FeatureChatPanel {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly router = inject(Router);

  private readonly list = viewChild<MessageList>('list');
  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly value = signal('');
  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );
  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);

  // True while the user is parked near the bottom of the message list.
  // Drives the composer's scroll-to-bottom overlay button visibility.
  // Sourced from MessageList's viewport position when the list is
  // mounted ; defaults to true when there are no messages yet.
  protected readonly autoFollowChat = computed(
    () => this.list()?.isAtBottom() ?? true,
  );

  protected readonly hasNextUnreadInProject =
    this.workspaces.hasOtherUnreadInProject(this.workspaceId);

  protected readonly catalog = LLM_MODEL_CATALOG;
  protected readonly providers = PROVIDERS;

  // Tracks streaming false-edge so we refocus the composer the instant
  // a run ends.
  private _wasStreaming = false;

  private readonly _activeChat = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.facade.activeChatFor(id);
  });

  protected readonly currentMode = computed<ChatMode>(
    () => this._activeChat()?.mode ?? 'agent',
  );
  protected readonly currentEffort = computed<EffortLevel>(
    () => this._activeChat()?.effort ?? 'medium',
  );
  protected readonly currentModelId = computed<string>(
    () => this._activeChat()?.modelId ?? DEFAULT_MODEL_ID,
  );

  focusComposer(): void {
    queueMicrotask(() => {
      const ta = this.composerEl()?.nativeElement.querySelector('textarea');
      ta?.focus();
    });
  }

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (id) {
        this.facade.ensureChatForWorkspace(id);
        this.focusComposer();
      }
    });

    effect(() => {
      const streaming = this.isStreaming();
      if (this._wasStreaming && !streaming) {
        this.focusComposer();
      }
      this._wasStreaming = streaming;
    });
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    // Sending implicitly re-engages auto-follow — the user wants to
    // see the assistant's reply land.
    this.list()?.scrollToBottom();
    void this.facade.sendUserMessage(id, event.text, event.mode);
    this.value.set('');
  }

  protected onStop(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.facade.cancelActive(id);
  }

  protected onModeChange(mode: ChatMode): void {
    const chat = this._activeChat();
    if (!chat) return;
    void this.facade.setChatMode(chat.id, mode);
  }

  protected onEffortChange(effort: EffortLevel): void {
    const chat = this._activeChat();
    if (!chat) return;
    void this.facade.setChatEffort(chat.id, effort);
  }

  protected onModelChange(modelId: string): void {
    const chat = this._activeChat();
    if (!chat) return;
    void this.facade.setChatModel(chat.id, modelId);
  }

  protected onScrollToBottom(): void {
    this.list()?.scrollToBottom();
  }

  protected onNextUnreadWorkspace(): void {
    const target = this.workspaces.nextUnreadInProject(this.workspaceId());
    if (!target) return;
    void this.router.navigate(['/workspaces', target]);
  }
}
