import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  animationFrameScheduler,
  combineLatest,
  fromEvent,
  NEVER,
} from 'rxjs';
import {
  auditTime,
  filter,
  finalize,
  switchMap,
  tap,
} from 'rxjs/operators';
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

// Type-guard for combineLatest predicates that wait on two
// "resolved" sources (a workspace + mainEl pair, a key + mainEl pair,
// etc.). Uses NonNullable on each tuple slot so the downstream
// destructure (`switchMap(([a, b]) => ...)`) sees non-null types —
// without this mapping TS keeps the `| null` in the inferred A/B and
// the narrowing is a no-op.
function bothResolved<A, B>(
  pair: [A, B],
): pair is [NonNullable<A>, NonNullable<B>] {
  const [a, b] = pair;
  return a != null && b != null;
}

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

    // Orchestrator registration: per-workspaceId binding, not
    // per-component. The same chat-scroll-surface instance can serve
    // multiple workspaces over its lifetime (Angular keeps the view
    // alive across same-route navigations when `tab().kind` stays
    // 'chat'). filter keeps the predicate pure; switchMap holds the
    // inner subscription open via NEVER; tap.subscribe and finalize
    // carry the only side effects (register / unregister). switchMap
    // unsubscribes the prior inner when (workspaceId, mainEl)
    // changes — finalize fires before tap.subscribe of the new
    // inner, so the order is unregister(old) → register(new) and
    // the Map never double-holds.
    combineLatest([
      toObservable(this.workspaceId),
      toObservable(this._mainEl),
    ])
      .pipe(
        filter(bothResolved),
        switchMap(([ws, el]) =>
          NEVER.pipe(
            tap({ subscribe: () => this.orchestrator.register(ws, el) }),
            finalize(() => this.orchestrator.unregister(ws)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    // Chat tab activate / switch: restore the new chat's scrollTop
    // after the next render (tap.subscribe), snapshot the prior
    // chat's scrollTop on unsubscribe (finalize). First visit to a
    // chat → default to bottom (newest message visible).
    //
    // combineLatest with `_mainEl` (not the bare `this.mainEl`
    // field) is load-bearing: `_chatTabKey` resolves on the post-CD
    // microtask, but `mainEl` is set inside `afterNextRender` which
    // runs AFTER that microtask. Without the signal in the source
    // pair, the first emission of `_chatTabKey` arrives while
    // mainEl is still null, the filter rejects it, and the recall
    // never fires — the user lands at scrollTop 0 on every first
    // chat mount instead of the bottom default. Same shape as the
    // orchestrator stream above.
    combineLatest([
      toObservable(this._chatTabKey),
      toObservable(this._mainEl),
    ])
      .pipe(
        filter(bothResolved),
        switchMap(([key, main]) =>
          NEVER.pipe(
            tap({
              subscribe: () => {
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
              },
            }),
            finalize(() => this.scroll.remember(key, main.scrollTop)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    // Message-arrival auto-follow. The messages signal fires when:
    //   - a new message is appended (user sends, agent placeholder
    //     appears, etc.)
    //   - the active message's content updates during streaming
    //     (the store creates a new array on each token mutation, so
    //     the signal fires per-token — easily 50+ emissions per
    //     frame for a fast stream)
    //   - the active chat changes (chat A -> chat B) — the tab-key
    //     stream's afterNextRender restore runs AFTER this rAF
    //     scrollTo, so a chat-switch overrides whatever this stream
    //     sets and lands the user at the stored position.
    //
    // `auditTime(0, animationFrameScheduler)` coalesces the burst of
    // per-token emissions to one write per animation frame, with the
    // latest emission winning. Display refreshes at ~60Hz so we
    // don't need finer granularity, and we drop ~50x scrollTop
    // writes per second of streaming. Target scrollHeight directly —
    // the browser clamps so when content fits in the viewport this
    // is a no-op.
    //
    // Two filters around the audit: the first gates emissions before
    // they enter the audit window (cheap early exit when detached or
    // no chat). The second re-checks at tap-time: a user can scroll
    // up DURING the audit window (the at-bottom listener flips us to
    // detached), and without re-checking we'd write scrollTop after
    // their manual scroll — undoing it. Both filters are pure
    // predicates; tap is the only side-effect site.
    toObservable(this._messages)
      .pipe(
        filter(() => this._isAttachedToActiveChat()),
        auditTime(0, animationFrameScheduler),
        filter(() => this._isAttachedToActiveChat()),
        tap(() => {
          const main = this.mainEl;
          if (!main) return;
          main.scrollTop = main.scrollHeight;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // Pure predicate shared between the pre-audit and post-audit
  // filters in the messages auto-follow stream. Returns true when
  // there is an active chat that's in attached mode AND a resolved
  // scroll surface to target.
  private _isAttachedToActiveChat(): boolean {
    const chatId = this._activeChatId();
    if (!chatId || !this.mainEl) return false;
    return this.scroll.isAttached(chatId);
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
