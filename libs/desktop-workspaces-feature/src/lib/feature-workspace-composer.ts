import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
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
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
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
 * Does NOT own the chat scroll surface. The at-bottom detector,
 * per-chat scroll persistence, and message-arrival auto-follow live
 * in `FeatureChatScrollSurface`, communicating via
 * `ChatScrollOrchestrator` (DOM seam) and `ScrollPositionService`
 * (attach/detach state).
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
  private readonly scroll = inject(ScrollPositionService);
  private readonly orchestrator = inject(ChatScrollOrchestrator);

  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  // Composer draft. linkedSignal resets to '' whenever the workspace
  // changes — composer is always-mounted in WorkspaceTabContent and
  // would otherwise carry a half-typed message from workspace A into
  // workspace B's composer (the view stays alive across same-route
  // navigations). User typing overrides locally; the next workspace
  // switch resets it again.
  protected readonly value = linkedSignal<string | null, string>({
    source: () => this.workspaceId(),
    computation: () => '',
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
  // no chat scroll surface registered with the orchestrator in that
  // mode. On a chat tab, sources the per-chat attach mode from
  // ScrollPositionService.
  protected readonly autoFollowChat = computed(() => {
    if (this.activeTabKind() === 'file') return true;
    const chatId = this._activeChatId();
    if (!chatId) return true;
    return this.scroll.followModeFor(chatId)() === 'attached';
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

    // Chat-surface-originated focus requests (e.g. a chat-scope event
    // that wants the user back in the composer). Today the streaming
    // false-edge above covers the only known consumer; this channel
    // stays here for future chat-surface events without re-coupling
    // components.
    toObservable(this.orchestrator.focusRequest)
      .pipe(
        filter(
          (req): req is NonNullable<typeof req> =>
            req !== null && req.workspaceId === this.workspaceId(),
        ),
        tap(() => this.focusComposer()),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    // Sending implicitly re-engages auto-follow — the user wants to
    // see the assistant's reply land.
    const chatId = this._activeChatId();
    if (chatId) this.scroll.setAttached(chatId);
    // Only request a chat scroll-to-bottom when a chat surface can
    // receive it. On a file tab the orchestrator has no registered
    // mainEl and would no-op anyway, but the explicit gate spells
    // out the intent (D3).
    if (this.activeTabKind() !== 'file') {
      this.orchestrator.scrollToBottom(id, true);
    }
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
    // On a file tab the overlay is hidden (autoFollowChat=true forced
    // above), so this handler shouldn't fire. The guard is here as a
    // belt-and-braces against template drift or programmatic emits.
    if (this.activeTabKind() === 'file') return;
    const id = this.workspaceId();
    if (!id) return;
    const chatId = this._activeChatId();
    if (chatId) this.scroll.setAttached(chatId);
    this.orchestrator.scrollToBottom(id, true);
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
