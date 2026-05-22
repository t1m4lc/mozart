import {
  ChangeDetectionStrategy,
  Component,
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
import { ChatFacade, FeatureChatContent } from '../../chat';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
} from '../../llm-model';
import { WorkspacesFacade } from '../data/workspace.facade';

@Component({
  selector: 'app-feature-workspace-middle',
  imports: [HlmComposer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full flex-col' },
  template: `
    <!-- Native browser scroll: the scroll happens on the shell's
         <main> overflow-y-auto. No internal scroll container here.
         The chat/file content area is flex-1 so that on short
         conversations the composer naturally sits at the bottom of
         the viewport (where its sticky offset takes over). -->
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

  // The chat content sits in the `[middle-content]` slot — querying it
  // as content (light DOM) keeps the frame agnostic of what's inside.
  // Undefined when a non-chat content (file tab) is projected.
  private readonly chatContent = contentChild(FeatureChatContent);
  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly value = signal('');
  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);

  // True while the user is parked near the bottom of the message list.
  // Drives the composer's scroll-to-bottom overlay button visibility.
  // Sourced from the projected chat content's `isAtBottom` signal ;
  // defaults to true when no chat content is in the slot (file tab) or
  // when the message list is unmounted (empty state).
  protected readonly autoFollowChat = computed(
    () => this.chatContent()?.isAtBottom() ?? true,
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
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    // Sending implicitly re-engages auto-follow — the user wants to
    // see the assistant's reply land.
    this.chatContent()?.scrollToBottom();
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
    this.chatContent()?.scrollToBottom();
  }

  protected onNextUnreadWorkspace(): void {
    const target = this.workspaces.nextUnreadInProject(this.workspaceId());
    if (!target) return;
    void this.router.navigate(['/workspaces', target]);
  }
}
