import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
  chatTabKey,
} from '@mozart/desktop-workspaces-data-access';

// Distance-from-bottom threshold (px) for the at-bottom detector.
// Under this, the chat is considered attached (auto-follow stream);
// over, it's detached (the user has scrolled up to read history).
const AT_BOTTOM_THRESHOLD_PX = 50;

/**
 * Chat-only scroll surface for the middle shell — the chat content's
 * frame and the home of all chat scroll behavior (at-bottom detector,
 * per-chat scroll persistence, message-arrival auto-follow). Only
 * mounted inside `WorkspaceTabContent`'s chat `@case`.
 *
 * Renamed from the legacy `FeatureWorkspaceMiddle` (P2.2): composer
 * mount + bindings moved to `FeatureWorkspaceComposer` (always
 * mounted, see that file's docstring). What remains is the chat
 * surface's exclusive concerns.
 *
 * Registers its resolved `<main>` element with
 * `ChatScrollOrchestrator` on mount so the always-mounted composer
 * can request `scrollToBottom` without owning DOM; unregisters on
 * destroy. The at-bottom detector reads
 * `ChatScrollOrchestrator.isInGracePeriod(workspaceId)` to suppress
 * attach/detach flips during a smooth programmatic scroll.
 */
@Component({
  selector: 'app-feature-chat-scroll-surface',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full flex-col' },
  template: `
    <!-- Chat scroll surface is the shell's <main> (overflow-y-auto in
         app-shell.ts). Owner of all scroll behavior for chat lives in
         this component — see the orchestration in the constructor.
         The content area stays flex-1 so the composer (mounted
         separately in WorkspaceTabContent) sits at viewport bottom
         on short conversations. -->
    <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-2.5">
      <ng-content />
    </div>
  `,
})
export class FeatureChatScrollSurface {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly injector = inject(Injector);
  private readonly scroll = inject(ScrollPositionService);
  private readonly orchestrator = inject(ChatScrollOrchestrator);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

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
  // auto-follow effect targets scrollHeight directly and lets the
  // tab-key effect's afterNextRender override on chat-switch.
  private readonly _messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );

  // The tab key for chat scroll persistence. Null when there's no
  // workspace or no active chat.
  private readonly _chatTabKey = computed(() => {
    const ws = this.workspaceId();
    const chatId = this._activeChatId();
    if (!ws || !chatId) return null;
    return chatTabKey(ws, chatId);
  });

  constructor() {
    // Resolve `<main>` and attach the at-bottom detector. The app is
    // zoneless (no zone.js in package.json) so listeners and signal
    // writes flow without zone bookkeeping. `{ passive: true }` keeps
    // the listener from blocking the browser's native scroll path.
    afterNextRender(
      () => {
        this.mainEl = closestScrollable(this.hostEl.nativeElement);
        if (!this.mainEl) {
          console.warn(
            '[chat-scroll-surface] no scrollable ancestor — chat scroll persistence disabled',
          );
          return;
        }
        const main = this.mainEl;

        // Register with the orchestrator so the always-mounted
        // composer can target this surface via scrollToBottom. The
        // composer never touches DOM; the orchestrator is the seam.
        const ws = this.workspaceId();
        if (ws) {
          this.orchestrator.register(ws, main);
        }

        const onScroll = () => {
          const wsId = this.workspaceId();
          // Suppress attach/detach flips during a programmatic
          // smooth scroll — those scroll events would otherwise
          // flip the chat to detached as scrollTop transits the
          // animation. The grace window lives in the orchestrator.
          if (wsId && this.orchestrator.isInGracePeriod(wsId)) {
            return;
          }
          const chatId = this._activeChatId();
          if (!chatId) return;

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
          const wsOnDestroy = this.workspaceId();
          if (wsOnDestroy) {
            this.orchestrator.unregister(wsOnDestroy);
          }
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
    // Standard auto-follow during streaming: while attached, keep
    // the bottom of the chat content pinned to the viewport bottom
    // on every messages-signal fire (which includes per-token
    // updates because the store creates a new array each token).
    // Target scrollHeight directly — the browser clamps so when
    // content fits in the viewport this is a no-op.
    effect(() => {
      this._messages();
      const chatId = this._activeChatId();
      const main = this.mainEl;

      if (!chatId || !main) return;
      if (!this.scroll.isAttached(chatId)) return;

      queueMicrotask(() => {
        main.scrollTop = main.scrollHeight;
      });
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
