import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUp, lucideCircleStop, lucidePlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import {
  MzTriggerMenu,
  buildTokenElement,
  serializeEditable,
  type TokenSpec,
} from '@mozart-ui/trigger-menu';
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
import {
  MzComposerSlashMenu,
  type SlashMenuGroup,
  type SlashMenuItem,
} from './mz-composer-slash-menu';
import { splitSkillTokens } from './slash-menu.logic';

export type ChatMode = 'agent' | 'plan' | 'ask';

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

// Skill pill styling. Global Tailwind utilities (not component-scoped CSS):
// the token is created via document.createElement inside the trigger-menu
// lib, so it never carries this component's emulated-encapsulation attribute
// — only global classes reach it. `font-bold` is the "validated" cue.
const SKILL_TOKEN_CLASS =
  'inline-block align-baseline whitespace-nowrap mx-px rounded px-1 ' +
  'font-bold text-primary bg-primary/10';

@Component({
  selector: 'mz-composer',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
    MzComposerPlusMenu,
    ComposerModeSelect,
    ComposerModelSelect,
    ComposerEffortSelect,
    ComposerScrollOverlay,
    MzComposerSlashMenu,
    MzTriggerMenu,
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

        <div class="relative">
          @if (_isEmpty()) {
            <div
              class="text-muted-foreground pointer-events-none absolute left-3 top-3 text-sm leading-6"
              aria-hidden="true"
            >
              {{ _effectivePlaceholder() }}
            </div>
          }
          <div
            #composerEditor
            [attr.aria-label]="_effectivePlaceholder()"
            [attr.contenteditable]="disabled() ? 'false' : 'true'"
            class="mz-composer-editor block w-full whitespace-pre-wrap break-words rounded-none border-0 bg-transparent p-3 text-sm leading-6 shadow-none outline-none select-text min-h-32 max-h-72 overflow-y-auto"
            mzTriggerMenu
            [trigger]="'/'"
            [menu]="skillMenu"
            [insert]="_skillToToken"
            [placement]="'top'"
            (opened)="skillMenuOpened.emit()"
            (input)="_onEditorInput()"
            (keydown)="_onKeydown($event)"
            (paste)="_onPaste($event)"
          ></div>
        </div>

        <div class="flex items-center gap-1 p-2 max-h-10">
          <mz-composer-plus-menu [disabled]="_chromeLocked()" />

          <mz-composer-effort-select
            [effort]="effort()"
            [disabled]="_chromeLocked()"
            (effortChange)="effort.set($event)"
          />

          <mz-composer-mode-select
            [mode]="_effectiveMode()"
            [disabled]="_chromeLocked() || askOnly()"
            (modeChange)="mode.set($event)"
          />

          <span class="flex-auto"></span>

          @if (models().length > 0) {
            <mz-composer-model-select
              [models]="models()"
              [providers]="providers()"
              [selectedModelId]="selectedModelId()"
              [disabled]="_chromeLocked()"
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
                <ng-icon hlm name="lucideCircleStop" size="sm" />
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
                <ng-icon hlm name="lucidePlus" size="sm" />
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
                <ng-icon hlm name="lucideArrowUp" size="sm" />
              </button>
            }
          }
        </div>
      </div>
    </form>

    <!-- Skill list injected into the trigger-menu overlay (positioned at the
         caret by the directive). -->
    <ng-template #skillMenu let-ctx>
      <mz-composer-slash-menu [ctx]="ctx" [groups]="skillGroups()" />
    </ng-template>
  `,
  styles: `
    .mz-composer-editor {
      scrollbar-width: thin;
      scrollbar-color: hsl(var(--primary)) transparent;
    }
    .mz-composer-editor::-webkit-scrollbar {
      width: 6px;
    }
    .mz-composer-editor::-webkit-scrollbar-track {
      background-color: transparent;
    }
    .mz-composer-editor::-webkit-scrollbar-thumb {
      background-color: hsl(var(--primary));
      border-radius: 1px;
    }
    .mz-composer-editor::-webkit-scrollbar-thumb:hover {
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
   *  the editor + send + effort enabled so the user can still ask
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
  /** Provider-filtered, source-grouped skills for the `/` menu. Empty ⇒ the
   *  menu opens but shows "No skills". The trigger / caret / pill mechanics
   *  are owned by the `mzTriggerMenu` directive. */
  readonly skillGroups = input<readonly SlashMenuGroup[]>([]);

  readonly send = output<ComposerSendEvent>();
  readonly stop = output<void>();
  readonly modelChange = output<string>();
  readonly scrollToBottom = output<void>();
  readonly nextUnreadWorkspace = output<void>();
  /** The `/` skill menu opened — a cue for the host to refresh discovery if
   *  its cache has gone stale. The host decides whether a re-scan is needed. */
  readonly skillMenuOpened = output<void>();

  private readonly _editor =
    viewChild<ElementRef<HTMLElement>>('composerEditor');

  constructor() {
    // Mirror external `value` changes (draft restore, clear-on-send) into the
    // editor DOM, rebuilding atomic tokens for known skills. Skipped when the
    // value already matches what we serialized (our own edits) so typing
    // never resets the caret.
    effect(() => {
      const editor = this._editor()?.nativeElement;
      const next = this.value();
      if (!editor) return;
      if (serializeEditable(editor) === next) return;
      this._renderValue(editor, next);
    });
  }

  protected readonly _canSubmit = computed(
    () => !this.disabled() && this.value().trim().length > 0,
  );

  protected readonly _isEmpty = computed(() => this.value().length === 0);

  private readonly _skillIds = computed(() => {
    const ids = new Set<string>();
    for (const group of this.skillGroups()) {
      for (const item of group.items) ids.add(item.id);
    }
    return ids;
  });

  // Chrome lock: when an agent run is in-flight (or the host has disabled the
  // whole composer), the mode / effort / model / plus controls are read-only.
  protected readonly _chromeLocked = computed(
    () => this.isRunning() || this.disabled(),
  );

  // askOnly forces the effective mode to `ask` for display + submission.
  protected readonly _effectiveMode = computed<ChatMode>(() =>
    this.askOnly() ? 'ask' : this.mode(),
  );

  protected readonly _effectivePlaceholder = computed(
    () => this.placeholder() || PLACEHOLDER_BY_MODE[this._effectiveMode()],
  );

  protected readonly _containerClasses = computed(
    () => CONTAINER_CLASSES_BY_MODE[this._effectiveMode()],
  );

  protected readonly _submitState = computed<'stop' | 'queue' | 'send'>(() => {
    if (!this.isRunning()) return 'send';
    return this.value().trim().length === 0 ? 'stop' : 'queue';
  });

  // Maps a chosen skill to the inline pill token the directive inserts. The
  // token serializes to `/<id>`, so it rides the prompt string sent to the
  // agent; `data` carries the full skill for any downstream consumer.
  protected readonly _skillToToken = (item: unknown): TokenSpec => {
    const skill = item as SlashMenuItem;
    return {
      label: `/${skill.id}`,
      value: `/${skill.id}`,
      data: skill,
      className: SKILL_TOKEN_CLASS,
    };
  };

  protected _onSubmit(event: Event): void {
    event.preventDefault();
    this._emitSubmit();
  }

  protected _onEditorInput(): void {
    const editor = this._editor()?.nativeElement;
    if (editor) this.value.set(serializeEditable(editor));
  }

  protected _onPaste(event: ClipboardEvent): void {
    // Force plain-text paste so the editor stays a flat run of text + tokens.
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const sel = window.getSelection();
    const editor = this._editor()?.nativeElement;
    if (!text || !sel || sel.rangeCount === 0 || !editor) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    this.value.set(serializeEditable(editor));
  }

  protected _onKeydown(event: KeyboardEvent): void {
    // The trigger-menu directive owns the keyboard while its menu is open
    // (capture phase + stopImmediatePropagation), so this handler only runs
    // when the menu is closed — no open-state tracking needed here.
    if (event.key !== 'Enter') return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      this._emitSubmit();
      return;
    }
    // Shift+Enter falls through to the browser (newline); serializeEditable
    // normalizes the resulting <br>/<div> to `\n`.
    if (event.shiftKey) return;
    event.preventDefault();
    this._emitSubmit();
  }

  // Rebuild the editor DOM from a serialized string, restoring tokens for
  // known skills, then drop the caret at the end.
  private _renderValue(editor: HTMLElement, value: string): void {
    editor.replaceChildren();
    for (const seg of splitSkillTokens(value, this._skillIds())) {
      editor.appendChild(
        seg.skill
          ? buildTokenElement(
              {
                label: seg.text,
                value: seg.text,
                className: SKILL_TOKEN_CLASS,
              },
              document,
            )
          : document.createTextNode(seg.text),
      );
    }
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  protected _emitStop(): void {
    this.stop.emit();
  }

  private _emitSubmit(): void {
    if (!this._canSubmit()) return;
    const text = this.value().trim();
    this.send.emit({ text, mode: this._effectiveMode() });
  }
}
