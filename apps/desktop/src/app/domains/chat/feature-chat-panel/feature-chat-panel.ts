import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
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
} from '@mozart/ui/composer';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
} from '../../llm-model';
import { WorkspacesFacade } from '../../workspaces';
import { ChatFacade } from '../data/chat.facade';
import { MessageList } from '../ui/message-list/message-list';

// Debounce window for the scroll-settled handler. Long enough to
// outlast a smooth programmatic scroll into the anchor (~400 ms),
// short enough that user-driven scroll decisions feel snappy.
const SCROLL_SETTLE_MS = 220;

@Component({
  selector: 'app-feature-chat-panel',
  imports: [HlmComposer, MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full' },
  template: `
    <div
      #scroller
      class="flex-1 min-h-0 overflow-y-auto"
      (scroll)="onContainerScroll()"
    >
      @if (messages().length > 0) {
        <app-message-list [messages]="messages()" />
        <div #anchor aria-hidden="true" class="h-px"></div>
      } @else {
        <ng-content select="[chat-empty-state]" />
      }
    </div>

    <div class="relative px-4 pb-4 pt-2" data-tour="composer-mode">
      <!-- Fades the last few px of the scrolling content into the composer
           area. One absolute layer; replaces the prior pointer-events
           dance that wrapped the whole composer region. -->
      <div
        class="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent dark:from-background"
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
  private readonly destroyRef = inject(DestroyRef);

  private readonly scroller =
    viewChild<ElementRef<HTMLDivElement>>('scroller');
  private readonly anchor = viewChild<ElementRef<HTMLDivElement>>('anchor');
  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly value = signal('');
  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );
  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);
  /** True while the user is parked near the bottom — drives the
   * composer's scroll-to-bottom overlay button visibility and the
   * auto-scroll-on-new-content effect. */
  protected readonly autoFollowChat = signal(true);
  protected readonly hasNextUnreadInProject =
    this.workspaces.hasOtherUnreadInProject(this.workspaceId);

  protected readonly catalog = LLM_MODEL_CATALOG;
  protected readonly providers = PROVIDERS;

  // Anchor visibility, driven by IntersectionObserver. The button
  // overlay reads `autoFollowChat`, not this — but the scroll-settle
  // handler uses this signal to decide whether to flip auto-follow.
  private readonly _anchorVisible = signal(true);

  // Set during programmatic scrollIntoView() so the scroll-settle
  // handler doesn't read anchorVisible mid-animation and disengage
  // auto-follow by mistake. Cleared after the smooth scroll typically
  // completes (~400 ms).
  private _suppressFollowUpdate = false;

  private _scrollDebounce: ReturnType<typeof setTimeout> | null = null;

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

  // Tracks the streaming false-edge so we can refocus the composer the
  // instant a run ends.
  private _wasStreaming = false;

  private _observer: IntersectionObserver | null = null;
  private _observedAnchor: HTMLElement | null = null;

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

    // IntersectionObserver setup. Lives in afterNextRender so the
    // view-children are populated. We re-bind whenever the anchor's
    // element instance changes (empty-state → message list, etc.).
    afterNextRender(() => {
      this._reobserveAnchor();
    });

    // Re-bind the observer whenever the messages array transitions
    // between empty and non-empty (changes whether the #anchor is
    // rendered at all).
    effect(() => {
      this.messages();
      // Read anchor view-child to track changes too.
      this.anchor();
      queueMicrotask(() => this._reobserveAnchor());
    });

    // Auto-follow effect: when messages change AND we're following,
    // scroll the anchor into view on the next animation frame.
    effect(() => {
      const msgs = this.messages();
      if (msgs.length === 0) return;
      if (!this.autoFollowChat()) return;
      requestAnimationFrame(() => this._scrollAnchorIntoView());
    });

    this.destroyRef.onDestroy(() => {
      this._observer?.disconnect();
      if (this._scrollDebounce) clearTimeout(this._scrollDebounce);
    });
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    // Sending implicitly re-engages auto-follow — the user wants to
    // see the assistant's reply land.
    this.autoFollowChat.set(true);
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

  protected onContainerScroll(): void {
    // Debounce — wait for the scroll to settle (user gesture OR
    // programmatic smooth-scroll completion), then sync autoFollow
    // with anchor visibility. The suppress flag short-circuits while
    // a programmatic scroll is in flight.
    if (this._scrollDebounce) clearTimeout(this._scrollDebounce);
    this._scrollDebounce = setTimeout(() => {
      this._scrollDebounce = null;
      if (this._suppressFollowUpdate) return;
      const next = this._anchorVisible();
      if (next !== this.autoFollowChat()) {
        this.autoFollowChat.set(next);
      }
    }, SCROLL_SETTLE_MS);
  }

  protected onScrollToBottom(): void {
    this.autoFollowChat.set(true);
    requestAnimationFrame(() => this._scrollAnchorIntoView());
  }

  protected onNextUnreadWorkspace(): void {
    const target = this.workspaces.nextUnreadInProject(this.workspaceId());
    if (!target) return;
    void this.router.navigate(['/workspaces', target]);
  }

  private _scrollAnchorIntoView(): void {
    const el = this.anchor()?.nativeElement;
    if (!el) return;
    this._suppressFollowUpdate = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'end',
    });
    // Lift the suppression once the smooth scroll should have
    // settled. 500 ms covers a comfortable smooth-scroll duration.
    setTimeout(() => {
      this._suppressFollowUpdate = false;
    }, 500);
  }

  private _reobserveAnchor(): void {
    const anchorEl = this.anchor()?.nativeElement ?? null;
    const scrollerEl = this.scroller()?.nativeElement ?? null;

    // Tear down the previous observation if the anchor element is gone
    // (empty-state, workspace switch).
    if (anchorEl !== this._observedAnchor) {
      this._observer?.disconnect();
      this._observer = null;
      this._observedAnchor = null;
    }

    if (!anchorEl || !scrollerEl) {
      // No anchor to observe yet — treat as "at the bottom" so the
      // overlay button stays hidden until a real conversation lands.
      this._anchorVisible.set(true);
      return;
    }

    if (this._observer && this._observedAnchor === anchorEl) {
      return; // already observing the right element
    }

    this._observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        this._anchorVisible.set(entry.isIntersecting);
      },
      { root: scrollerEl, threshold: 0 },
    );
    this._observer.observe(anchorEl);
    this._observedAnchor = anchorEl;
  }
}
