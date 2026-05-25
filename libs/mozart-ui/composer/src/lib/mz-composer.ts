import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUp, lucideCircleStop, lucidePlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTextareaImports } from '@spartan-ui/textarea';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { ComposerEffortSelect } from './mz-composer-effort-select';
import { ComposerModeSelect } from './mz-composer-mode-select';
import {
  ComposerModelSelect,
  type ModelOption,
  type ProviderId,
  type ProviderInfo,
} from './mz-composer-model-select';
import { MzComposerPlusMenu } from './mz-composer-plus-menu';
import { ComposerScrollOverlay } from './mz-composer-scroll-overlay';

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
  selector: 'mz-composer',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTextareaImports,
    HlmTooltipImports,
    MzComposerPlusMenu,
    ComposerModeSelect,
    ComposerModelSelect,
    ComposerEffortSelect,
    ComposerScrollOverlay,
  ],
  providers: [
    provideIcons({
      lucideArrowUp,
      lucideCircleStop,
      lucidePlus,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form class="relative block" (submit)="_onSubmit($event)">
      <mz-composer-scroll-overlay
        [autoFollowChat]="autoFollowChat()"
        [hasNextUnreadInProject]="hasNextUnreadInProject()"
        (scrollToBottom)="scrollToBottom.emit()"
        (nextUnreadWorkspace)="nextUnreadWorkspace.emit()"
      />
      <div
        class="relative flex flex-col rounded-xl border bg-background dark:bg-card shadow-sm overflow-hidden transition-colors"
        [class]="_containerClasses()"
      >
        @if (_effectiveMode() === 'ask') {
          <span
            class="absolute top-2 right-3 z-10 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            aria-hidden="true"
          >
            Read-only
          </span>
        }

        <textarea
          hlmTextarea
          class="mz-composer-textarea block w-full resize-none rounded-none border-0 bg-transparent p-3 text-sm leading-6 shadow-none outline-none select-text dark:bg-transparent min-h-24 max-h-72 overflow-y-auto focus-visible:border-0 focus-visible:ring-0"
          [value]="value()"
          (input)="_onInput($event)"
          [disabled]="disabled()"
          name="prompt"
          [placeholder]="_effectivePlaceholder()"
          (keydown)="_onKeydown($event)"
        ></textarea>

        <div class="flex items-center gap-1 p-2 max-h-10">
          <mz-composer-plus-menu />

          <mz-composer-effort-select
            [effort]="effort()"
            (effortChange)="effort.set($event)"
          />

          <mz-composer-mode-select
            [mode]="_effectiveMode()"
            [disabled]="isRunning() || disabled() || askOnly()"
            (modeChange)="mode.set($event)"
          />

          <span class="flex-auto"></span>

          @if (models().length > 0) {
            <mz-composer-model-select
              [models]="models()"
              [providers]="providers()"
              [selectedModelId]="selectedModelId()"
              (modelChange)="modelChange.emit($event)"
            />
          }

          @switch (_submitState()) {
            @case ('stop') {
              <button
                hlmBtn
                variant="default"
                size="icon-xs"
                type="button"
                hlmTooltip="Stop"
                class="h-7 rounded px-3"
                (click)="_emitStop()"
                aria-label="Stop current run"
              >
                <ng-icon hlm name="lucideCircleStop" size="xs" />
              </button>
            }
            @case ('queue') {
              <button
                hlmBtn
                variant="default"
                size="icon-xs"
                type="submit"
                class="h-7 rounded px-3"
                [disabled]="!_canSubmit()"
                hlmTooltip="Send to queue — current run keeps going"
                aria-label="Queue message"
              >
                <ng-icon hlm name="lucidePlus" size="xs" />
              </button>
            }
            @default {
              <button
                hlmBtn
                variant="default"
                size="icon-xs"
                type="submit"
                class="h-7 rounded px-3"
                [disabled]="!_canSubmit()"
                hlmTooltip="Send"
                [attr.aria-label]="
                  _effectiveMode() === 'plan'
                    ? 'Plan'
                    : _effectiveMode() === 'ask'
                      ? 'Ask'
                      : 'Send message'
                "
              >
                <ng-icon hlm name="lucideArrowUp" size="xs" />
              </button>
            }
          }
        </div>
      </div>
    </form>
  `,
  styles: `
    .mz-composer-textarea {
      scrollbar-width: thin;
      scrollbar-color: hsl(var(--primary)) transparent;
    }
    .mz-composer-textarea::-webkit-scrollbar {
      width: 6px;
    }
    .mz-composer-textarea::-webkit-scrollbar-track {
      background-color: transparent;
    }
    .mz-composer-textarea::-webkit-scrollbar-thumb {
      background-color: hsl(var(--primary));
      border-radius: 1px;
    }
    .mz-composer-textarea::-webkit-scrollbar-thumb:hover {
      background-color: hsl(var(--primary) / 0.85);
    }
  `,
})
export class MzComposer {
  readonly value = model('');
  readonly mode = model<ChatMode>('agent');
  readonly effort = model<EffortLevel>('medium');
  readonly isRunning = input(false);
  /** Override the mode-derived placeholder. Empty string = use the
   * mode default from `PLACEHOLDER_BY_MODE`. */
  readonly placeholder = input('');
  readonly disabled = input(false);
  /** Plan P0.2: when the host workspace is frozen, the composer keeps
   *  textarea + send + effort enabled so the user can still ask
   *  read-only questions (and tune effort if desired) — only the mode
   *  is locked to `ask`. The host sets this to `frozen()` separately
   *  from `disabled()` so the two intents don't bleed into each other. */
  readonly askOnly = input(false);
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

  // The host can be frozen (askOnly = true). Rather than mutating the
  // mode model from a signal write (which is illegal during render),
  // we derive an effective mode for display + submission. The mode
  // select is also disabled when askOnly, so the user can never push
  // a different mode while the composer is forced into `ask`.
  protected readonly _effectiveMode = computed<ChatMode>(() =>
    this.askOnly() ? 'ask' : this.mode(),
  );

  protected readonly _effectivePlaceholder = computed(
    () => this.placeholder() || PLACEHOLDER_BY_MODE[this._effectiveMode()],
  );

  protected readonly _containerClasses = computed(
    () => CONTAINER_CLASSES_BY_MODE[this._effectiveMode()],
  );

  // Three submit states with visually-distinct affordances:
  //  - stop : running, textarea empty (red Stop button)
  //  - queue: running, textarea has text (plus icon; submit queues)
  //  - send : not running (arrow-up Send)
  protected readonly _submitState = computed<'stop' | 'queue' | 'send'>(() => {
    if (!this.isRunning()) return 'send';
    return this.value().trim().length === 0 ? 'stop' : 'queue';
  });

  protected _onSubmit(event: Event): void {
    event.preventDefault();
    this._emitSubmit();
  }

  protected _onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
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
    // Emit the effective mode (`ask` when askOnly, otherwise the
    // user-selected mode) so the host's `(send)` consumer never sees
    // a stale mode through the askOnly gate.
    this.send.emit({ text, mode: this._effectiveMode() });
  }
}
