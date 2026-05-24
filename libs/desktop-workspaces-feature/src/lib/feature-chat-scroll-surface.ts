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
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
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
  // `overflow-y-auto` + `min-h-0` make this element the chat scroll
  // ancestor instead of <main>. Required because the composer is now
  // absolutely positioned inside WorkspaceTabContent — if <main>
  // owned the scroll, the composer would scroll away with the content
  // (absolute is positioned relative to WorkspaceTabContent, which
  // would translate with main's scrollTop). Scoping scroll to this
  // surface keeps the composer overlay pinned at viewport bottom.
  host: { class: 'flex min-h-0 w-full flex-col overflow-y-auto' },
  template: `
    <!-- Inner wrapper centers chat content + caps width. Bottom padding
         clears the absolutely-positioned composer overlay (composer
         chrome ≈ 100px) so the last message stays visible above it. -->
    <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-2.5 pb-32">
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

  // Resolved scroll surface (this component's own host once it has
  // `overflow-y-auto`). Stored as a signal so the orchestrator
  // registration effect can re-fire once it resolves, and so it stays
  // null-safe when the component is mounted in a test harness without
  // a scroll ancestor.
  private readonly _mainEl = signal<HTMLElement | null>(null);

  // Mirror for non-reactive consumers (the scroll/recall effects below
  // run before mainEl is set; they bail and re-run once the signal
  // updates).
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
        const el = closestScrollable(this.hostEl.nativeElement);
        if (!el) {
          console.warn(
            '[chat-scroll-surface] no scrollable ancestor — chat scroll persistence disabled',
          );
          return;
        }
        this.mainEl = el;
        this._mainEl.set(el);

        // Subscribe to scroll events via fromEvent — declarative, with
        // takeUntilDestroyed handling teardown so we don't manage
        // listener lifetime by hand. `{ passive: true }` keeps the
        // listener off the browser's blocking scroll path.
        fromEvent(el, 'scroll', { passive: true })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
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
              el.scrollHeight - el.scrollTop - el.clientHeight;
            const atBottom = distance < AT_BOTTOM_THRESHOLD_PX;
            const currentlyAttached = this.scroll.isAttached(chatId);

            if (atBottom && !currentlyAttached) {
              this.scroll.setAttached(chatId);
            } else if (!atBottom && currentlyAttached) {
              this.scroll.setDetached(chatId);
            }
          });
      },
      { injector: this.injector },
    );

    // Orchestrator registration is a per-workspaceId binding, not a
    // per-component one. The same chat-scroll-surface instance can
    // serve multiple workspaces over its lifetime (Angular keeps the
    // view alive across same-route navigations when `tab().kind`
    // stays 'chat'). Re-fire on every workspaceId change and rely on
    // the effect's onCleanup to unregister the prior binding — that
    // way the orchestrator's Map never accumulates dead entries and
    // composer's `scrollToBottom(currentWs)` always finds the live
    // mainEl.
    effect((onCleanup) => {
      const ws = this.workspaceId();
      const el = this._mainEl();
      if (!ws || !el) return;
      this.orchestrator.register(ws, el);
      onCleanup(() => {
        this.orchestrator.unregister(ws);
      });
    });

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
