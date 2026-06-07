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
import { Router } from '@angular/router';
import {
  MzComposer,
  type AtMenuFileItem,
  type ChatMode,
  type ComposerSendEvent,
  type EffortLevel,
  type SlashMenuGroup,
} from '@mozart-ui/composer';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ComposerModelsStore } from '@mozart/desktop-llm-model-data-access';
import {
  PROVIDERS,
  composerModels,
  defaultModelIdForProvider,
} from '@mozart/desktop-llm-model-util';
import { groupSkills, mergeSkillCatalogs } from '@mozart/desktop-skills-util';
import { SkillsStore } from '@mozart/desktop-skills-data-access';
import { ProjectFilesStore } from '@mozart/desktop-files-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  ChatScrollOrchestrator,
  ScrollPositionService,
  WorkspacesFacade,
} from '@mozart/desktop-workspaces-data-access';
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';
import { filter, pairwise, tap } from 'rxjs/operators';

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
  host: { class: 'block w-full px-3' },
  template: `
    @if (needsProvider()) {
      <div
        class="bg-muted/40 text-muted-foreground mx-auto mb-2 flex w-full max-w-5xl items-center justify-between gap-3 rounded-md border border-border/60 px-4 py-2 text-xs"
        role="status"
      >
        <span>Connect a provider to run an agent.</span>
        <button
          type="button"
          class="text-foreground font-medium underline-offset-2 hover:underline"
          (click)="onConnectProvider()"
        >
          Connect
        </button>
      </div>
    }
    <mz-composer
      class="bg-background mx-auto w-full max-w-5xl pb-2.5 shadow-md"
      data-tour="composer-mode"
      #composerEl
      [(value)]="value"
      [mode]="currentMode()"
      (modeChange)="onModeChange($event)"
      [effort]="currentEffort()"
      (effortChange)="onEffortChange($event)"
      [models]="catalog()"
      [providers]="providers"
      [skillGroups]="skillGroups()"
      [fileItems]="fileItems()"
      [fileItemsLoading]="fileItemsLoading()"
      [selectedModelId]="currentModelId()"
      (modelChange)="onModelChange($event)"
      [contextUsedTokens]="contextUsedTokens()"
      [contextMaxTokens]="contextMaxTokens()"
      [isRunning]="isStreaming()"
      [askOnly]="frozen()"
      [autoFollowChat]="autoFollowChat()"
      [hasNextUnreadInProject]="hasNextUnreadInProject()"
      (skillMenuOpened)="onSkillMenuOpened()"
      (send)="onSend($event)"
      (stop)="onStop()"
      (scrollToBottom)="onScrollToBottom()"
      (nextUnreadWorkspace)="onNextUnreadWorkspace()"
    />
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
  private readonly profile = inject(ProfileFacade);
  private readonly skills = inject(SkillsStore);
  private readonly files = inject(ProjectFilesStore);
  private readonly composerModels = inject(ComposerModelsStore);
  private readonly router = inject(Router);

  // Show the connect-CTA only once BOTH provider probes have settled to a
  // non-connected state — never while a probe is in flight (avoids a CTA
  // flash on boot) and never when either provider is wired up.
  protected readonly needsProvider = computed(() => {
    const settled = (s: string) => s !== 'unknown' && s !== 'checking';
    return (
      settled(this.profile.status()) &&
      settled(this.profile.codexStatus()) &&
      !this.profile.hasAnyProvider()
    );
  });
  private readonly injector = inject(Injector);
  private readonly scroll = inject(ScrollPositionService);
  private readonly orchestrator = inject(ChatScrollOrchestrator);
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
  // The model shown selected in the composer. Falls back to a
  // provider-appropriate default (then the first shown model) when the chat's
  // pick is unset or has been disabled in Settings, so the trigger never
  // shows a model the dropdown can't offer.
  protected readonly currentModelId = computed<string>(() => {
    const shown = this.catalog();
    const explicit = this._activeChat()?.modelId;
    if (explicit && shown.some((m) => m.id === explicit)) return explicit;
    const fallback = defaultModelIdForProvider(
      this.profile.activeAgentProvider(),
    );
    if (shown.some((m) => m.id === fallback)) return fallback;
    return shown[0]?.id ?? fallback;
  });

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

  // Context-window gauge. `max` = selected model's window; `used` = the
  // input tokens of the latest run with reported usage (the prompt grows
  // as the conversation does). Either null ⇒ the composer hides the gauge.
  private readonly _messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );
  protected readonly contextMaxTokens = computed<number | null>(
    () =>
      this.catalog().find((m) => m.id === this.currentModelId())
        ?.contextWindow ?? null,
  );
  protected readonly contextUsedTokens = computed<number | null>(() => {
    const msgs = this._messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const u = msgs[i]?.turnState?.usage;
      // True context size = uncached input + cache reads + cache creation.
      // Claude reports `input_tokens` as the uncached remainder only, so the
      // cached portion must be added back to reflect the real fill.
      if (
        u &&
        (u.inputTokens != null ||
          u.cacheReadTokens != null ||
          u.cacheCreationTokens != null)
      ) {
        return (
          (u.inputTokens ?? 0) +
          (u.cacheReadTokens ?? 0) +
          (u.cacheCreationTokens ?? 0)
        );
      }
    }
    return null;
  });

  // Only the models the user enabled in Settings (empty pref ⇒ all runnable).
  protected readonly catalog = computed(() =>
    composerModels(this.composerModels.enabledIds()),
  );
  protected readonly providers = PROVIDERS;

  // Skill discovery is project/repo-scoped (not worktree). The repo id is the
  // workspace's projectId; `null` before a workspace is selected ⇒ provider
  // globals only.
  private readonly _activeProjectId = computed(
    () =>
      this.workspaces.workspaceById(this.workspaceId() ?? '')()?.projectId ??
      null,
  );

  // The (connected providers, project) scope the slash menu discovers for.
  // Drives both the cache read (`skillGroups`) and the discovery trigger (an
  // RxJS stream). Every connected provider is scanned — not just the active
  // one — so a Codex user sees Codex skills even when Claude also wins the run.
  private readonly _skillScope = computed(() => ({
    providers: this.profile.connectedAgentProviders(),
    projectId: this._activeProjectId(),
  }));

  // Skills for the `/` menu: every connected backend's discovered skills +
  // agnostic Mozart skills, merged (each scan repeats the agnostic ones),
  // grouped by source, mapped to the composer's view-model. Sourced from the
  // cached SkillsStore; the composer owns the `/` trigger, filtering, and nav.
  protected readonly skillGroups = computed<readonly SlashMenuGroup[]>(() => {
    const projectId = this._activeProjectId();
    const merged = mergeSkillCatalogs(
      this.profile
        .connectedAgentProviders()
        .map((p) => this.skills.skillsFor(p, projectId)),
    );
    return groupSkills(merged).map((g) => ({
      key: g.key,
      label: g.label,
      items: g.skills.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        disabled: s.availability !== 'available',
      })),
    }));
  });

  // Fire-and-forget TTL-aware discovery for every connected provider scope.
  // The store no-ops fresh scopes, so calling this both on scope change and on
  // each menu open is cheap — a filesystem re-scan only happens once a scope's
  // cache has gone stale (see SkillsStore's TTL).
  private loadConnectedSkills(): void {
    const projectId = this._activeProjectId();
    this.profile
      .connectedAgentProviders()
      .forEach((p) => void this.skills.load(p, projectId));
  }

  // The `/` menu opened: re-scan connected providers if their cache is stale,
  // so skills added on disk surface without an app restart.
  onSkillMenuOpened(): void {
    this.loadConnectedSkills();
  }

  // Flat, ranked project files for the `@` menu, mapped to the composer's
  // view-model. Sourced from ProjectFilesStore (which reuses the repositories
  // tree/changed caches + file-view marks + open tabs); the composer owns the
  // `@` trigger, filtering, selection, and pill insertion.
  private readonly _fileEntries = this.files.fileEntriesFor(this.workspaceId);
  // The WHOLE project file set, ranked by relevance (tabs → changed → viewed →
  // all). The menu fuzzy-searches across all of it and caps what it renders, so
  // every file is findable without ever loading the full list into the DOM.
  protected readonly fileItems = computed<readonly AtMenuFileItem[]>(() =>
    this._fileEntries().map((e) => ({ path: e.path, badge: e.badge })),
  );
  protected readonly fileItemsLoading = this.files.fileLoadingFor(
    this.workspaceId,
  );

  // Default focus → composer editor. afterNextRender is the
  // reliable hook: when this runs on a workspaceId change, the
  // composer's editor may not yet be in the DOM (viewChild ref
  // populates after the current CD pass). Scheduling on the next
  // render guarantees the editor is present when we call .focus().
  // CDK has no standalone "auto-focus" directive — `cdkFocusInitial`
  // only fires inside a `cdkTrapFocus` region — so we drive this
  // directly via `afterNextRender`.
  focusComposer(): void {
    afterNextRender(
      () => {
        const el = this.composerEl()?.nativeElement.querySelector(
          '[contenteditable]',
        ) as HTMLElement | null;
        el?.focus();
      },
      { injector: this.injector },
    );
  }

  constructor() {
    // Idempotent provider probes so `needsProvider()` resolves on first
    // mount (the onboarding step may have been skipped). No-ops if already
    // probed.
    void this.profile.initialize();
    void this.profile.initializeCodex();

    // Discover skills when the (providers, project) scope changes. Declared as
    // an RxJS stream rather than a signal effect — same rationale as the focus
    // triggers below (the only action is the fire-and-forget `load` side
    // effect). The store caches per (provider, project) scope, so this only
    // hits the filesystem on a new (or TTL-stale) scope; switching
    // model/workspace re-reads the cache. Each connected provider is its scope.
    toObservable(this._skillScope)
      .pipe(
        tap(() => this.loadConnectedSkills()),
        takeUntilDestroyed(),
      )
      .subscribe();

    // Refresh the file sources (tree + changed) when the workspace changes so
    // the `@` menu has fresh data even if the file tree / Changes aside was
    // never opened. The repositories caches dedupe + keep old data on error.
    toObservable(this.workspaceId)
      .pipe(
        filter((id): id is string => id !== null),
        tap((id) => this.files.refresh(id)),
        takeUntilDestroyed(),
      )
      .subscribe();

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
    if (chatId) this.uiState.clearChatDraft(id, chatId);
    this.value.set('');
  }

  protected onStop(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.facade.cancelActive(id);
  }

  protected onConnectProvider(): void {
    void this.router.navigate(['/settings']);
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
