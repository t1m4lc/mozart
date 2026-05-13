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
import { HlmToggleImports } from '@mozart/ui/toggle';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideCornerDownLeft,
  lucideMap,
  lucideSignalMedium,
  lucideSquare,
} from '@ng-icons/lucide';
import { HlmComposerPlusMenu } from './hlm-composer-plus-menu';

export type ComposerMode = 'normal' | 'plan';

export interface ComposerSendEvent {
  readonly text: string;
  readonly mode: ComposerMode;
}

@Component({
  selector: 'hlm-composer',
  imports: [
    FormsModule,
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTextareaImports,
    HlmToggleImports,
    HlmTooltipImports,
    HlmComposerPlusMenu,
  ],
  providers: [
    provideIcons({
      lucideBot,
      lucideCornerDownLeft,
      lucideMap,
      lucideSignalMedium,
      lucideSquare,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form class="block" (submit)="_onSubmit($event)">
      <div
        class="flex flex-col rounded-xl border border-border bg-background dark:bg-card shadow-sm overflow-hidden transition-colors"
        [class.border-primary]="mode() === 'plan'"
        [class.border-dashed]="mode() === 'plan'"
      >
        <textarea
          hlmTextarea
          class="hlm-composer-textarea block w-full border-0 outline-none shadow-none rounded-none resize-none bg-transparent dark:bg-transparent px-3 pt-3 pb-6 text-sm leading-6 min-h-28 max-h-72 overflow-y-auto scroll-pb-3 focus-visible:ring-0 focus-visible:border-0"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          [disabled]="disabled()"
          name="prompt"
          [placeholder]="placeholder()"
          (keydown)="_onKeydown($event)"
        ></textarea>

        <div class="flex items-center gap-1 px-2 py-2">
          <button
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            disabled
            hlmTooltip="Coming soon"
            aria-label="Select model"
            class="rounded-lg text-muted-foreground"
          >
            <ng-icon hlm name="lucideBot" size="xs" />
            <span>Claude Sonnet 4.6</span>
          </button>

          <button
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            disabled
            hlmTooltip="Adjust effort level"
            aria-label="Adjust effort level"
            class="rounded-lg text-muted-foreground"
          >
            <ng-icon
              hlm
              name="lucideSignalMedium"
              size="xs"
              class="text-brand/70"
            />
            <span>Medium</span>
          </button>

          <button
            hlmToggle
            size="sm"
            type="button"
            [state]="mode() === 'plan' ? 'on' : 'off'"
            (stateChange)="_onPlanStateChange($event)"
            [disabled]="isRunning() || disabled()"
            [hlmTooltip]="
              mode() === 'plan' ? 'Exit plan mode' : 'Enter plan mode'
            "
            [attr.aria-label]="
              mode() === 'plan' ? 'Exit plan mode' : 'Enter plan mode'
            "
            class="rounded-lg"
          >
            <ng-icon hlm name="lucideMap" size="xs" />
            @if (mode() === 'plan') {
              <span>Plan</span>
            }
          </button>

          <span class="flex-auto"></span>

          <hlm-composer-plus-menu />

          @if (isRunning()) {
            <button
              hlmBtn
              variant="destructive"
              size="icon-sm"
              type="button"
              hlmTooltip="Stop"
              class="ml-2 rounded-lg"
              (click)="_emitStop()"
              aria-label="Stop current run"
            >
              <ng-icon hlm name="lucideSquare" size="xs" />
            </button>
          }
          <button
            hlmBtn
            variant="default"
            size="sm"
            type="submit"
            [class.ml-1]="isRunning()"
            [class.ml-2]="!isRunning()"
            class="rounded-lg"
            [disabled]="!_canSubmit()"
            [hlmTooltip]="isRunning() ? 'Queue message — the current run keeps going' : null"
          >
            <span>{{ mode() === 'plan' ? 'Plan' : 'Send' }}</span>
            <ng-icon hlm name="lucideCornerDownLeft" size="xs" />
          </button>
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
  readonly mode = model<ComposerMode>('normal');
  readonly isRunning = input(false);
  readonly placeholder = input('Type a message…');
  readonly disabled = input(false);

  readonly send = output<ComposerSendEvent>();
  readonly stop = output<void>();

  protected readonly _canSubmit = computed(
    () => !this.disabled() && this.value().trim().length > 0,
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

  protected _onPlanStateChange(state: 'on' | 'off'): void {
    this.mode.set(state === 'on' ? 'plan' : 'normal');
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
