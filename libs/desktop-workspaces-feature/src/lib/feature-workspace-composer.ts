import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter, pairwise, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import {
  MzComposer,
  type ChatMode,
  type ComposerSendEvent,
  type EffortLevel,
} from '@mozart-ui/composer';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
} from '@mozart/desktop-llm-model-util';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';
import {
  ScrollSurfaceRegistry,
  WorkspacesFacade,
} from '@mozart/desktop-workspaces-data-access';

/**
 * Always-mounted composer host. Lives inside `WorkspaceTabContent`
 * ABOVE the `@switch`, so the composer is visible on every workspace
 * tab kind (chat AND file). Owns:
 *
 *   - Composer template + sticky bottom chrome
 *   - `value` (draft) signal — preserved across tab switches because
 *     the component is the same instance throughout a workspace visit
 *   - Facade-bound mode/effort/model from the workspace's active chat
 *   - Send/stop/mode/effort/model handlers
 *   - Tab-aware scroll-to-bottom: hides the overlay AND no-ops the
 *     output when the active tab is a file tab (P2.2 D3)
 *   - Self-owned focus management — workspaceId change + streaming
 *     false-edge both refocus the textarea
 *
 * Does NOT own the chat scroll surface. The at-bottom detector
 * (IntersectionObserver on a sentinel), per-chat scroll persistence,
 * and message-arrival auto-follow (overflow-anchor) all live on the
 * MzScrollSurface directive applied inside FeatureChatScrollSurface.
 * The composer reaches that surface via ScrollSurfaceRegistry
 * (workspaceId-keyed seam) — no DOM coupling, no orchestrator timer.
 */
@Component({
  selector: 'app-feature-workspace-composer',
  imports: [MzComposer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <!-- Composer is positioned by the parent (WorkspaceTabContent gives
         the host \`absolute inset-x-0 bottom-0\`) so it overlays whatever
         content is in the @switch — chat scrolling behind it, file
         editor extending full-height with composer floating on top. -->
    <div class="bg-background" data-tour="composer-mode">
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
export class FeatureWorkspaceComposer {
  readonly workspaceId = input<string | null>(null);
  readonly frozen = input<boolean>(false);
  // The active tab kind from `WorkspaceTabContent`. When `'file'`,
  // the composer hides its scroll-to-bottom overlay and no-ops the
  // output — there's no meaningful chat scroll surface to target.
  readonly activeTabKind = input<'chat' | 'file' | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly registry = inject(ScrollSurfaceRegistry);
  private readonly uiState = inject(UiStateFacade);

  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);

  private readonly _activeChat = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.facade.activeChatFor(id);
  });

  private readonly _activeChatId = computed(
    () => this._activeChat()?.id ?? null,
  );

  // Composer draft, session-only per (workspaceId, chatId). The
  // linkedSignal is the local edit buffer; on (workspace, chat) change
  // the computation loads the saved draft for that pair so half-typed
  // messages survive a workspace switch. User typing flows back into
  // the session store via the effect below — both reads and writes are
  // wrapped in `untracked` so this can't feed back into itself.
  protected readonly value = linkedSignal<
    { ws: string | null; chat: string | null },
    string
  >({
    source: () => ({
      ws: this.workspaceId(),
      chat: this._activeChatId(),
    }),
    computation: ({ ws, chat }) => {
      if (!ws || !chat) return '';
      return untracked(() => this.uiState.readChatDraft(ws, chat));
    },
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

  // Composer auto-follow indicator. Forced to `true` on a file tab
  // (P2.2 D3) so the scroll-to-bottom overlay stays hidden — there's
  // no chat scroll surface registered in that mode. On a chat tab,
  // reads the registered surface's isAtBottom signal: an IntersectionO-
  // bserver on the message-list sentinel drives this, replacing the
  // legacy 50px-threshold scroll-event listener.
  private readonly _isAtBottomSignal = computed(() => {
    const id = this.workspaceId();
    return id ? this.registry.isAtBottom(id) : null;
  });
  protected readonly autoFollowChat = computed(() => {
    if (this.activeTabKind() === 'file') return true;
    const sig = this._isAtBottomSignal();
    return sig ? sig() : true;
  });

  protected readonly hasNextUnreadInProject =
    this.workspaces.hasOtherUnreadInProject(this.workspaceId);

  protected readonly catalog = LLM_MODEL_CATALOG;
  protected readonly providers = PROVIDERS;

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
    // Mirror the local edit buffer into the session store so the draft
    // for (workspaceId, chatId) survives workspace switches. Wrapped in
    // `untracked` so the write doesn't re-trigger the effect via the
    // session store's signal.
    effect(() => {
      const ws = this.workspaceId();
      const chat = this._activeChatId();
      const v = this.value();
      if (!ws || !chat) return;
      untracked(() => {
        this.uiState.writeChatDraft(ws, chat, v);
      });
    });

    // All three focus triggers are declared as RxJS streams instead of
    // signal effects: the only mutation is the textarea .focus() call
    // (genuine DOM side effect inside tap), and pairwise() expresses
    // the streaming false-edge without a mutable "wasStreaming"
    // tracker. takeUntilDestroyed handles lifetime.

    // Focus on workspace change (including first mount).
    toObservable(this.workspaceId)
      .pipe(
        filter((id): id is string => id !== null),
        tap(() => this.focusComposer()),
        takeUntilDestroyed(),
      )
      .subscribe();

    // Streaming false-edge: refocus the instant a chat run ends. Skip
    // when the user is on a file tab — pulling focus to the composer
    // mid-edit because a background chat stream ended is a focus-thief
    // bug. pairwise compares consecutive emissions so we don't need a
    // mutable tracker.
    toObservable(this.isStreaming)
      .pipe(
        pairwise(),
        filter(([prev, curr]) => prev && !curr),
        filter(() => this.activeTabKind() !== 'file'),
        tap(() => this.focusComposer()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    const chatId = this._activeChatId();
    // Only request a chat scroll-to-bottom when a chat surface is
    // registered (chat tab). On a file tab the registry returns null
    // and the explicit gate also spells out the intent (D3).
    // Auto-follow re-engages automatically: smooth-scrolling to the
    // bottom moves the IO sentinel into view, the directive's
    // isAtBottom flips to true, and the composer's overlay hides.
    if (this.activeTabKind() !== 'file') {
      this.registry.get(id)?.scrollToBottom(true);
    }
    void this.facade.sendUserMessage(id, event.text, event.mode);
    if (chatId) this.uiState.clearChatDraft(id, chatId);
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
    // On a file tab the overlay is hidden (autoFollowChat=true forced
    // above), so this handler shouldn't fire. The guard is here as a
    // belt-and-braces against template drift or programmatic emits.
    if (this.activeTabKind() === 'file') return;
    const id = this.workspaceId();
    if (!id) return;
    this.registry.get(id)?.scrollToBottom(true);
  }

  protected onNextUnreadWorkspace(): void {
    const target = this.workspaces.nextUnreadInProject(this.workspaceId());
    if (!target) return;
    const workspace = this.workspaces.workspaceById(target)();
    if (!workspace) return;
    void this.router.navigate(
      workspaceRouteCommands(workspace.projectId, target),
    );
  }
}
