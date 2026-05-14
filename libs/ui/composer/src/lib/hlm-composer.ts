import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTextareaImports } from '@mozart/ui/textarea';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUp, lucideCircleStop } from '@ng-icons/lucide';
import { ComposerEffortSelect } from './composer-effort-select';
import { ComposerModeSelect } from './composer-mode-select';
import {
  ComposerModelSelect,
  type ModelOption,
  type ProviderId,
  type ProviderInfo,
} from './composer-model-select';
import { ComposerScrollOverlay } from './composer-scroll-overlay';
import { HlmComposerPlusMenu } from './hlm-composer-plus-menu';

export type ChatMode = 'agent' | 'plan' | 'ask';
/** @deprecated Use `ChatMode`. Kept as an alias during Phase 2 rename. */
export type ComposerMode = ChatMode;

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ComposerSendEvent {
  readonly text: string;
  readonly mode: ChatMode;
}

const PLACEHOLDER_BY_MODE: Record<ChatMode, string> = {
  agent: 'Ask Mozart to make a change, run a command, or anything else',
  plan: 'Describe the change — Mozart will plan before touching files',
  ask: 'Ask anything — read-only mode, no file edits',
};

const CONTAINER_CLASSES_BY_MODE: Record<ChatMode, string> = {
  agent: 'border-border bg-muted/40 dark:bg-muted/20',
  plan: 'border-primary border-dashed bg-primary/5',
  ask: 'border-muted-foreground bg-muted/30 dark:bg-muted/15',
};

@Component({
  selector: 'hlm-composer',
  imports: [
    FormsModule,
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTextareaImports,
    HlmTooltipImports,
    HlmComposerPlusMenu,
    ComposerModeSelect,
    ComposerModelSelect,
    ComposerEffortSelect,
    ComposerScrollOverlay,
  ],
  providers: [
    provideIcons({
      lucideArrowUp,
      lucideCircleStop,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form class="relative block" (submit)="_onSubmit($event)">
      <composer-scroll-overlay
        [autoFollowChat]="autoFollowChat()"
        [hasNextUnreadInProject]="hasNextUnreadInProject()"
        (scrollToBottom)="scrollToBottom.emit()"
        (nextUnreadWorkspace)="nextUnreadWorkspace.emit()"
      />
      <div
        class="relative flex flex-col rounded-xl border bg-background dark:bg-card shadow-sm overflow-hidden transition-colors"
        [class]="_containerClasses()"
      >
        @if (mode() === 'ask') {
          <span
            class="absolute top-2 right-3 z-10 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            aria-hidden="true"
          >
            Read-only
          </span>
        }

        <textarea
          hlmTextarea
          class="hlm-composer-textarea block w-full border-0 outline-none shadow-none rounded-none resize-none bg-transparent dark:bg-transparent px-3 pt-4 pb-3 text-sm leading-6 min-h-28 max-h-72 overflow-y-auto scroll-pb-3 focus-visible:ring-0 focus-visible:border-0"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          [disabled]="disabled()"
          name="prompt"
          [placeholder]="_effectivePlaceholder()"
          (keydown)="_onKeydown($event)"
        ></textarea>

        <div class="flex items-center gap-1 px-2 pt-1 pb-1.5">
          <hlm-composer-plus-menu />

          <composer-effort-select
            [effort]="effort()"
            (effortChange)="effort.set($event)"
          />

          <composer-mode-select
            [mode]="mode()"
            [disabled]="isRunning() || disabled()"
            (modeChange)="mode.set($event)"
          />

          <span class="flex-auto"></span>

          @if (models().length > 0) {
            <composer-model-select
              [models]="models()"
              [providers]="providers()"
              [selectedModelId]="selectedModelId()"
              (modelChange)="modelChange.emit($event)"
            />
          }

          @if (isRunning() && value().trim().length === 0) {
            <button
              hlmBtn
              variant="destructive"
              size="icon-sm"
              type="button"
              hlmTooltip="Stop"
              class="rounded-lg"
              (click)="_emitStop()"
              aria-label="Stop current run"
            >
              <ng-icon hlm name="lucideCircleStop" size="sm" />
            </button>
          } @else {
            <button
              hlmBtn
              variant="default"
              size="icon-sm"
              type="submit"
              class="rounded-lg"
              [disabled]="!_canSubmit()"
              [hlmTooltip]="
                isRunning()
                  ? 'Queue message — current run keeps going'
                  : 'Send message'
              "
              [attr.aria-label]="
                mode() === 'plan'
                  ? 'Plan'
                  : mode() === 'ask'
                  ? 'Ask'
                  : 'Send message'
              "
            >
              <ng-icon hlm name="lucideArrowUp" size="sm" />
            </button>
          }
        </div>
      </div>
    </form>
  `,
  styles: `
    .hlm-composer-textarea {
      scrollbar-width: thin;
      scrollbar-color: hsl(var(--primary)) transparent;
    }
    .hlm-composer-textarea::-webkit-scrollbar {
      width: 6px;
    }
    .hlm-composer-textarea::-webkit-scrollbar-track {
      background-color: transparent;
    }
    .hlm-composer-textarea::-webkit-scrollbar-thumb {
      background-color: hsl(var(--primary));
      border-radius: 1px;
    }
    .hlm-composer-textarea::-webkit-scrollbar-thumb:hover {
      background-color: hsl(var(--primary) / 0.85);
    }
  `,
})
export class HlmComposer {
  readonly value = model('');
  readonly mode = model<ChatMode>('agent');
  readonly effort = model<EffortLevel>('medium');
  readonly isRunning = input(false);
  /** Override the mode-derived placeholder. Empty string = use the
   * mode default from `PLACEHOLDER_BY_MODE`. */
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly models = input<readonly ModelOption[]>([]);
  readonly providers = input<Record<ProviderId, ProviderInfo>>({
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic',
      iconName: 'lucideSparkles',
    },
    openai: { id: 'openai', label: 'OpenAI', iconName: 'lucideCpu' },
    local: { id: 'local', label: 'Local', iconName: 'lucideHardDrive' },
  });
  readonly selectedModelId = input<string>('');
  readonly autoFollowChat = input(true);
  readonly hasNextUnreadInProject = input(false);

  readonly send = output<ComposerSendEvent>();
  readonly stop = output<void>();
  readonly modelChange = output<string>();
  readonly scrollToBottom = output<void>();
  readonly nextUnreadWorkspace = output<void>();

  protected readonly _canSubmit = computed(
    () => !this.disabled() && this.value().trim().length > 0,
  );

  protected readonly _effectivePlaceholder = computed(
    () => this.placeholder() || PLACEHOLDER_BY_MODE[this.mode()],
  );

  protected readonly _containerClasses = computed(
    () => CONTAINER_CLASSES_BY_MODE[this.mode()],
  );

  protected _onSubmit(event: Event): void {
    event.preventDefault();
    this._emitSubmit();
  }

  protected _onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this._emitSubmit();
      return;
    }
    if (event.shiftKey) return;
    event.preventDefault();
    this._emitSubmit();
  }

  protected _emitStop(): void {
    this.stop.emit();
  }

  private _emitSubmit(): void {
    if (!this._canSubmit()) return;
    const text = this.value().trim();
    this.send.emit({ text, mode: this.mode() });
  }
}
