import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  contentChild,
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
  ScrollPositionService,
  chatTabKey,
} from '../../../core/scroll-position.service';
import { ChatFacade, FeatureChatContent } from '../../chat';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
} from '../../llm-model';
import { FeatureFileContent } from '../feature-file-content/feature-file-content';
import { WorkspacesFacade } from '../data/workspace.facade';

// Distance-from-bottom threshold (px) for the at-bottom detector. Under
// this, the chat is considered attached (auto-follow stream); over,
// it's detached (the user has scrolled up to read history).
const AT_BOTTOM_THRESHOLD_PX = 50;

// Where the just-sent user message lands as a fraction of viewport
// height from the top of `<main>`. 0.2 = 1/5 from top, leaving 4/5
// below for the agent's response (ChatGPT-style).
const USER_MESSAGE_TOP_FRACTION = 0.2;

@Component({
  selector: 'app-feature-workspace-middle',
  imports: [HlmComposer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full flex-col' },
  template: `
    <!-- Chat scroll surface is the shell's <main> (overflow-y-auto in
         app-shell.ts). Owner of all scroll behavior for chat lives in
         this component — see the orchestration in the constructor.
         The content area stays flex-1 so the composer sits at viewport
         bottom on short conversations. -->
    <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-2.5">
      <ng-content />
    </div>

    <!-- Composer pinned at the bottom via position: sticky. The
         <main> overflow ancestor is its sticky context, so it stays
         at viewport bottom while the chat scrolls behind it. -->
    <div class="sticky bottom-0 z-20 bg-background" data-tour="composer-mode">
      <div class="relative mx-auto w-full max-w-5xl px-3 pb-3">
        <div
          class="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-linear-to-t from-background to-transparent dark:from-background"
          aria-hidden="true"
        ></div>
        <mz-composer
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
          [askOnly]="frozen()"
          [autoFollowChat]="autoFollowChat()"
          [hasNextUnreadInProject]="hasNextUnreadInProject()"
          (send)="onSend($event)"
          (stop)="onStop()"
          (scrollToBottom)="onScrollToBottom()"
          (nextUnreadWorkspace)="onNextUnreadWorkspace()"
        />
      </div>
    </div>
  `,
})
export class FeatureWorkspaceMiddle {
  readonly workspaceId = input<string | null>(null);
  readonly frozen = input<boolean>(false);

  private readonly facade = inject(ChatFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly scroll = inject(ScrollPositionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  // Projected content probes — distinguish chat mode from file mode
  // without coupling to the parent's activeFileTabPath signal.
  private readonly chatContent = contentChild(FeatureChatContent);
  private readonly fileContent = contentChild(FeatureFileContent);

  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly value = signal('');
  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);

  // Composer auto-follow indicator: sources the per-chat attach mode
  // from ScrollPositionService when chat content is mounted; defaults
  // to true on the file tab so the scroll-to-bottom overlay stays
  // hidden in that mode.
  protected readonly autoFollowChat = computed(() => {
    if (this.fileContent()) return true;
    const chatId = this._activeChatId();
    if (!chatId) return true;
    return this.scroll.followModeFor(chatId)() === 'attached';
  });

  protected readonly hasNextUnreadInProject =
    this.workspaces.hasOtherUnreadInProject(this.workspaceId);

  protected readonly catalog = LLM_MODEL_CATALOG;
  protected readonly providers = PROVIDERS;

  // Tracks streaming false-edge so we refocus the composer the instant
  // a run ends.
  private _wasStreaming = false;

  // Programmatic-scroll grace window. While `performance.now() <
  // _programmaticScrollUntil`, the at-bottom detector is suppressed —
  // a smooth scrollTo() takes ~300-500ms and fires scroll events at
  // partway scrollTop values that would otherwise flip the chat to
  // detached. We open this window before Send / scroll-to-bottom-button
  // smooth scrolls; closing comfortably after the animation finishes.
  private _programmaticScrollUntil = 0;

  // Cached scroll surface — `<main>` in app-shell. Walked once after
  // first render. Null until resolved (or if the orchestrator is used
  // in a test harness without a scroll ancestor).
  private mainEl: HTMLElement | null = null;

  private readonly _activeChat = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.facade.activeChatFor(id);
  });

  private readonly _activeChatId = computed(
    () => this._activeChat()?.id ?? null,
  );

  // Messages for the workspace's active chat. The signal recomputes
  // when activeChatId changes (chat A → chat B) AND when the active
  // chat's message array changes (new token / new message). The
  // auto-follow effect distinguishes these two via _lastSyncedChatId.
  private readonly _messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );

  // The tab key for chat scroll persistence. Null when:
  //   - no workspace / no active chat
  //   - file tab is active (the file's own [mzScrollPersist] directive
  //     owns scroll persistence for that surface)
  private readonly _chatTabKey = computed(() => {
    if (this.fileContent()) return null;
    const ws = this.workspaceId();
    const chatId = this._activeChatId();
    if (!ws || !chatId) return null;
    return chatTabKey(ws, chatId);
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

  // Default focus → composer textarea. afterNextRender is the
  // reliable hook: when this runs on a workspaceId change, the
  // composer's textarea may not yet be in the DOM (viewChild ref
  // populates after the current CD pass). Scheduling on the next
  // render guarantees the textarea is present when we call .focus().
  // CDK has no standalone "auto-focus" directive — `cdkFocusInitial`
  // only fires inside a `cdkTrapFocus` region — so we drive this
  // directly via `afterNextRender`.
  focusComposer(): void {
    afterNextRender(
      () => {
        const ta = this.composerEl()?.nativeElement.querySelector('textarea');
        ta?.focus();
      },
      { injector: this.injector },
    );
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

    // Resolve `<main>` and attach the at-bottom detector. The app is
    // zoneless (no zone.js in package.json) so listeners and signal
    // writes flow without zone bookkeeping. `{ passive: true }` keeps
    // the listener from blocking the browser's native scroll path.
    afterNextRender(
      () => {
        this.mainEl = closestScrollable(this.hostEl.nativeElement);
        if (!this.mainEl) {
          console.warn(
            '[workspace-middle] no scrollable ancestor — chat scroll persistence disabled',
          );
          return;
        }
        const main = this.mainEl;

        const onScroll = () => {
          // Suppress attach/detach flips during a programmatic
          // smooth scroll — those scroll events would otherwise
          // flip the chat to detached as scrollTop transits the
          // animation.
          if (performance.now() < this._programmaticScrollUntil) {
            return;
          }
          const chatId = this._activeChatId();
          if (!chatId) return;
          if (this.fileContent()) return;

          const distance =
            main.scrollHeight - main.scrollTop - main.clientHeight;
          const atBottom = distance < AT_BOTTOM_THRESHOLD_PX;
          const currentlyAttached = this.scroll.isAttached(chatId);

          if (atBottom && !currentlyAttached) {
            this.scroll.setAttached(chatId);
          } else if (!atBottom && currentlyAttached) {
            this.scroll.setDetached(chatId);
          }
        };
        main.addEventListener('scroll', onScroll, { passive: true });
        this.destroyRef.onDestroy(() => {
          main.removeEventListener('scroll', onScroll);
        });
      },
      { injector: this.injector },
    );

    // Chat tab activate / switch: snapshot the prior chat's scrollTop
    // (via onCleanup) and restore the new chat's value after the next
    // render. First visit to a chat → default to bottom (newest
    // message visible).
    effect((onCleanup) => {
      const key = this._chatTabKey();
      const main = this.mainEl;
      if (!key || !main) return;

      const stored = this.scroll.recall(key);
      afterNextRender(
        () => {
          if (stored != null) {
            main.scrollTop = stored;
          } else {
            // First visit: chat default is bottom (newest).
            main.scrollTop = main.scrollHeight;
          }
        },
        { injector: this.injector },
      );

      onCleanup(() => {
        this.scroll.remember(key, main.scrollTop);
      });
    });

    this.destroyRef.onDestroy(() => {
      const key = this._chatTabKey();
      if (key && this.mainEl) {
        this.scroll.remember(key, this.mainEl.scrollTop);
      }
    });

    // Message-arrival auto-follow. The messages signal fires when:
    //   - a new message is appended (user sends, agent placeholder
    //     appears, etc.)
    //   - the active message's content updates during streaming
    //     (the store creates a new array on each token mutation, so
    //     the signal fires per-token)
    //   - the active chat changes (chat A -> chat B) — but the
    //     tab-key effect's afterNextRender restore runs AFTER this
    //     microtask scrollTo, so a chat-switch overrides whatever
    //     this effect sets and lands the user at the stored position.
    //
    // We skip the auto-follow when the last message is from the user
    // — onSend handles that case by smooth-scrolling the user's prompt
    // toward 1/5 from top (when there's enough history above to make
    // that scroll possible). Once the agent's placeholder/response
    // message arrives, role flips to 'assistant' and normal
    // auto-follow resumes.
    //
    // The scroll target is the bottom of the MESSAGE-LIST and the
    // scroll only moves DOWNWARD — never yank the user up to "follow"
    // the agent. Together those guarantee the 1/5-from-top positioning
    // isn't undone the moment the agent placeholder appears.
    effect(() => {
      const msgs = this._messages();
      const chatId = this._activeChatId();
      const inFileMode = this.fileContent() !== undefined;
      const main = this.mainEl;

      if (!chatId || inFileMode || !main) return;
      if (!this.scroll.isAttached(chatId)) return;

      const lastMsg = msgs.at(-1);
      if (lastMsg?.role === 'user') return;

      queueMicrotask(() => {
        const msgList = main.querySelector('app-message-list');
        if (!msgList) {
          main.scrollTop = main.scrollHeight;
          return;
        }
        const listRect = msgList.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        const listBottomInContent =
          listRect.bottom - mainRect.top + main.scrollTop;
        const targetScrollTop = listBottomInContent - main.clientHeight;
        // Scroll only DOWNWARD — never yank the user up to "follow"
        // the agent, otherwise the 1/5-from-top positioning at Send
        // would be undone the moment the placeholder appears.
        if (targetScrollTop > main.scrollTop) {
          main.scrollTop = targetScrollTop;
        }
      });
    });
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    // Sending implicitly re-engages auto-follow — the user wants to
    // see the assistant's reply land.
    const chatId = this._activeChatId();
    if (chatId) this.scroll.setAttached(chatId);
    void this.facade.sendUserMessage(id, event.text, event.mode);
    this.value.set('');

    // After the user message renders, position it at 1/5 from <main>'s
    // viewport top so the agent's response has room to fill below
    // (ChatGPT-style). The messages-effect skip on role 'user'
    // prevents an interim scroll-to-bottom from fighting this.
    afterNextRender(
      () => this.scrollLastUserMessageToTopFraction(),
      { injector: this.injector },
    );
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
    const chatId = this._activeChatId();
    if (chatId) this.scroll.setAttached(chatId);
    this.scrollMainToBottom(true);
  }

  protected onNextUnreadWorkspace(): void {
    const target = this.workspaces.nextUnreadInProject(this.workspaceId());
    if (!target) return;
    void this.router.navigate(['/workspaces', target]);
  }

  // Reads prefers-reduced-motion and applies smooth vs auto. `smooth`
  // is honored only when the user hasn't asked for reduced motion.
  // When smooth applies, opens a grace window so the partway scroll
  // events the animation fires don't flip the chat to detached.
  private scrollMainToBottom(smooth: boolean): void {
    const main = this.mainEl;
    if (!main) return;
    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useSmooth = !reduced && smooth;
    if (useSmooth) {
      // 700ms covers the default smooth-scroll duration (~500ms in
      // Chromium) plus a margin for layout settling.
      this._programmaticScrollUntil = performance.now() + 700;
    }
    main.scrollTo({
      top: main.scrollHeight,
      behavior: useSmooth ? 'smooth' : 'auto',
    });
  }

  // Positions the last user-message element at USER_MESSAGE_TOP_FRACTION
  // of `<main>`'s viewport height from the top, smooth-scrolling
  // there. Falls back to scroll-to-bottom if no user message is
  // found in the DOM. Opens the programmatic-scroll grace window so
  // the partway scroll events during the animation don't flip the
  // chat to detached.
  private scrollLastUserMessageToTopFraction(): void {
    const main = this.mainEl;
    if (!main) return;
    const userEls = main.querySelectorAll('app-user-message');
    const lastUser = userEls[userEls.length - 1] as
      | HTMLElement
      | undefined;
    if (!lastUser) {
      this.scrollMainToBottom(true);
      return;
    }
    const userRect = lastUser.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const currentOffset = userRect.top - mainRect.top;
    const targetOffset = main.clientHeight * USER_MESSAGE_TOP_FRACTION;
    const delta = currentOffset - targetOffset;
    if (Math.abs(delta) < 1) return;
    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._programmaticScrollUntil = performance.now() + 700;
    main.scrollBy({
      top: delta,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }
}

// Walks up the DOM looking for the first ancestor whose computed
// overflow-y is `auto` or `scroll`. Falls back to the document's
// scrolling element so callers never have to handle null on a
// well-formed page. Returns null only if `start` is detached.
function closestScrollable(start: HTMLElement | null): HTMLElement | null {
  let el = start;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    el = el.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}
