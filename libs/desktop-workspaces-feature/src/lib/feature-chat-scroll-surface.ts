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
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
  chatTabKey,
} from '@mozart/desktop-workspaces-data-access';
import { NEVER, animationFrameScheduler, combineLatest, fromEvent } from 'rxjs';
import { auditTime, filter, finalize, switchMap, tap } from 'rxjs/operators';

// Distance-from-content-end threshold (px) for the at-bottom
// detector. Under this, the chat is considered attached (auto-follow
// stream); over, it's detached (the user has scrolled up to read
// history). Measured from the bottom of the last real message, not
// from `scrollHeight` — `MessageList` appends a 50vh in-flight
// spacer that would otherwise keep the detector permanently
// detached.
const AT_BOTTOM_THRESHOLD_PX = 80;

// Effective vertical footprint of the composer overlay measured from
// the bottom of the scroll surface viewport. The composer is
// absolutely positioned over the bottom of WorkspaceTabContent, so
// any scrollTop math that wants the newest message to land just
// above it needs to subtract this from `clientHeight`. The inner
// scroll wrapper's `pb-48` (192px) keeps content from clipping at
// rest ; this constant is the smaller working zone the auto-follow
// targets while streaming. Measured against the real composer
// chrome height (~120–140px depending on mode selectors) plus
// breathing room.
const COMPOSER_OVERLAY_PX = 160;

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
    <!-- Top fade : a sticky gradient pinned to the top of the
         scroll surface viewport. Softens the hard line where chat
         content used to clip against the workspace header as the
         user scrolled. Lives as a sibling before the inner wrapper
         so flex layout doesn't compress its height. -->
    <div
      class="pointer-events-none sticky top-0 z-10 h-8 -mb-8 bg-linear-to-b from-background to-transparent dark:from-background"
      aria-hidden="true"
    ></div>
    <!-- Inner wrapper centers chat content + caps width. Bottom padding
         clears the absolutely-positioned composer overlay (composer
         chrome ≈ 120–140px) so the last message stays visible above
         it. pb-48 = 192px mirrors COMPOSER_OVERLAY_PX (160px) plus
         32px of breathing room — measured during dogfood, text used
         to land flush against the composer chrome with pb-32. -->
    <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-4 pb-48">
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
        let prevScrollTop = el.scrollTop;
        fromEvent(el, 'scroll', { passive: true })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            const wsId = this.workspaceId();
            const currScrollTop = el.scrollTop;
            // A programmatic scroll-to-bottom moves scrollTop DOWN; a
            // user scrolling up moves it UP. During the grace window
            // we suppress flips for the former but must respect the
            // latter — otherwise the user can't escape auto-follow
            // mid-stream. End the grace window early so the auto-
            // follow effect's next-frame write sees `detached` and
            // skips.
            const userScrolledUp = currScrollTop < prevScrollTop;
            prevScrollTop = currScrollTop;
            if (wsId && this.orchestrator.isInGracePeriod(wsId)) {
              if (!userScrolledUp) return;
              this.orchestrator.endGracePeriod(wsId);
            }
            const chatId = this._activeChatId();
            if (!chatId) return;

            // Distance from the visible (unobscured) bottom to the
            // bottom of the last real message. The in-flight 50vh
            // spacer past `lastMsg` doesn't count as "content I
            // haven't seen yet" — without anchoring on the message
            // element we'd be permanently detached.
            const distance = distanceFromContentEnd(el);
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
    combineLatest([toObservable(this.workspaceId), toObservable(this._mainEl)])
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
    combineLatest([toObservable(this._chatTabKey), toObservable(this._mainEl)])
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
    //
    // Scroll target (post 2026-05-25 dogfood) : aim at the BOTTOM of
    // the last real message element, not `scrollHeight`. MessageList
    // appends a 50vh in-flight spacer below the last message so the
    // assistant prose has room to land — targeting scrollHeight would
    // park scrollTop at the bottom of that spacer (empty), pushing
    // the assistant text off the top of the viewport. Targeting the
    // last message's offsetBottom keeps the newest text visible just
    // above the spacer. Browser clamps to scrollHeight - clientHeight
    // when content + spacer fit in viewport (early conversation), so
    // this is still safe in tiny cases.
    toObservable(this._messages)
      .pipe(
        filter(() => this._isAttachedToActiveChat()),
        auditTime(0, animationFrameScheduler),
        filter(() => this._isAttachedToActiveChat()),
        tap(() => {
          const main = this.mainEl;
          if (!main) return;
          const lastMsg = lastMessageEl(main);
          if (!lastMsg) {
            main.scrollTop = main.scrollHeight;
            return;
          }
          const contentBottom = lastMsg.offsetTop + lastMsg.offsetHeight;
          // Effective visible bottom excludes the composer overlay —
          // anything below this line is obscured by the absolutely-
          // positioned composer, so we treat it as off-screen.
          const visibleBottom =
            main.scrollTop + main.clientHeight - COMPOSER_OVERLAY_PX;
          // Content still fits above the composer — don't move.
          if (contentBottom <= visibleBottom) return;
          // Otherwise pull scrollTop just enough to bring the
          // message bottom flush with the unobscured visible bottom
          // (just above the composer chrome).
          main.scrollTop =
            contentBottom - main.clientHeight + COMPOSER_OVERLAY_PX;
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

// Find the bottom-most rendered message element inside the scroll
// surface. Used by the auto-follow tap to anchor scroll on the real
// content instead of the in-flight spacer that MessageList appends.
// Returns null when no message is mounted yet (cold load).
function lastMessageEl(scope: HTMLElement): HTMLElement | null {
  const selectors =
    'app-agent-message, app-user-message, app-system-info-message, app-setup-progress-message';
  const all = scope.querySelectorAll<HTMLElement>(selectors);
  return all.length === 0 ? null : (all[all.length - 1] ?? null);
}

// Pixels between the bottom of the last real message and the
// effective (composer-aware) visible bottom of the scroll surface.
// Positive when the message extends below the unobscured viewport
// (content hidden behind composer), negative when the message ends
// above the composer — i.e., room to spare.
function distanceFromContentEnd(main: HTMLElement): number {
  const lastMsg = lastMessageEl(main);
  if (!lastMsg) {
    // No content yet — fall back to the scrollHeight delta so the
    // initial state still resolves as "at bottom" on empty chats.
    return main.scrollHeight - main.scrollTop - main.clientHeight;
  }
  const contentBottom = lastMsg.offsetTop + lastMsg.offsetHeight;
  const visibleBottom =
    main.scrollTop + main.clientHeight - COMPOSER_OVERLAY_PX;
  return contentBottom - visibleBottom;
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
