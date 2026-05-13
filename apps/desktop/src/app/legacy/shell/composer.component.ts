/**
 * `ComposerComponent` — message composer extracted from
 * `ChatPanelComponent`. Owns the textarea, the toolbar of disabled
 * "coming-soon" controls (model picker, effort picker, mode toggle,
 * attachments, links, issues), the `⌘⏎` kbd hint, and the Send/Stop
 * button pair.
 *
 * The streaming + agent-run plumbing stays in `ChatPanelComponent`.
 * This component is purely presentational over a `model('')` two-way
 * binding for the prompt text plus a `submit`/`stop` output pair.
 *
 * Per the v0.0.1 product vocabulary rules (CLAUDE.md, DESIGN.md
 * Rule 7), every visibly-disabled control carries an `[hlmTooltip]`
 * naming the milestone that unblocks it. Here we settle on a uniform
 * "Coming in a later milestone" string for all six controls — the
 * exact milestone isn't pinned yet for any of them and the team
 * preferred a single consistent label across the toolbar.
 *
 * Keyboard contract preserved from the previous inline composer:
 *   - Enter            → submit + clear
 *   - Shift+Enter      → newline (default textarea behaviour)
 *   - ⌘↵ / Ctrl+↵     → submit + clear
 */
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
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmKbdImports } from '@mozart/ui/kbd';
import { HlmTextareaImports } from '@mozart/ui/textarea';
import { HlmToggleGroupImports } from '@mozart/ui/toggle-group';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideGauge,
  lucideHash,
  lucideLink,
  lucidePaperclip,
} from '@ng-icons/lucide';

@Component({
  selector: 'app-composer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmKbdImports,
    HlmTextareaImports,
    HlmToggleGroupImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideBot,
      lucideGauge,
      lucideHash,
      lucideLink,
      lucidePaperclip,
    }),
  ],
  host: { class: 'block' },
  template: `
    <form
      class="composer flex flex-col gap-2 px-4 py-3 border-t border-border"
      (submit)="onSubmit($event)"
    >
      <textarea
        hlmTextarea
        class="resize-y min-h-16"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        [disabled]="isRunning()"
        name="prompt"
        [placeholder]="placeholder()"
        rows="3"
        (keydown)="onKeydown($event)"
      ></textarea>

      <div class="flex items-center gap-1 flex-wrap">
        <!-- Left group: Model / Effort / Mode -->
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          [hlmDropdownMenuTrigger]="modelMenu"
          aria-label="Select model"
          class="text-muted-foreground"
        >
          <ng-icon name="lucideBot" class="toolbar-icon" />
          <span>Model</span>
        </button>
        <ng-template #modelMenu>
          <hlm-dropdown-menu></hlm-dropdown-menu>
        </ng-template>

        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          [hlmDropdownMenuTrigger]="effortMenu"
          aria-label="Select effort"
          class="text-muted-foreground"
        >
          <ng-icon name="lucideGauge" class="toolbar-icon" />
          <span>Effort</span>
        </button>
        <ng-template #effortMenu>
          <hlm-dropdown-menu></hlm-dropdown-menu>
        </ng-template>

        <span class="inline-flex items-center mx-0.5" [hlmTooltip]="comingSoon">
          <hlm-toggle-group
            class="opacity-100"
            disabled
            value="normal"
            aria-label="Agent mode"
          >
            <button
              hlmToggleGroupItem
              type="button"
              value="normal"
              disabled
              size="sm"
            >
              Normal
            </button>
            <button
              hlmToggleGroupItem
              type="button"
              value="plan"
              disabled
              size="sm"
            >
              Plan
            </button>
          </hlm-toggle-group>
        </span>

        <span
          class="inline-block w-px h-5 mx-1.5 bg-border"
          aria-hidden="true"
        ></span>

        <!-- Middle group: attachments / links / issues -->
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          aria-label="Attach file"
          class="text-muted-foreground"
        >
          <ng-icon name="lucidePaperclip" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          aria-label="Link"
          class="text-muted-foreground"
        >
          <ng-icon name="lucideLink" />
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          aria-label="Issue"
          class="text-muted-foreground"
        >
          <ng-icon name="lucideHash" />
        </button>

        <span class="flex-auto"></span>

        <!-- Right group: kbd hint + Send / Stop -->
        <span
          class="inline-flex items-center gap-0.5 mr-1.5 text-muted-foreground"
          aria-hidden="true"
        >
          <kbd hlmKbd>&#8984;</kbd>
          <kbd hlmKbd>&#9166;</kbd>
        </span>

        @if (isRunning()) {
          <button
            hlmBtn
            variant="destructive"
            size="sm"
            type="button"
            class="stop-btn"
            (click)="emitStop()"
          >
            Stop
          </button>
        } @else {
          <button
            hlmBtn
            variant="default"
            size="sm"
            type="submit"
            class="send-btn"
            [disabled]="!canSend()"
          >
            Send
          </button>
        }
      </div>
    </form>
  `,
  styles: `
    .composer {
      background: var(--bg-composer, hsl(var(--card)));
    }
    .toolbar-icon {
      --ng-icon__size: 14px;
    }
  `,
})
export class ComposerComponent {
  /** Two-way prompt text. Parent owns the source of truth. */
  readonly value = model('');

  /** Streams a run? Disables textarea + swaps Send → Stop. */
  readonly isRunning = input(false);

  /** Placeholder copy for the textarea. */
  readonly placeholder = input('Type a message…');

  /** Submit current prompt. Parent decides what to do with it.
   *  Named `send` (not `submit`) because Angular ESLint forbids output
   *  names that collide with native DOM events. */
  readonly send = output<string>();

  /** Stop the in-flight run. */
  readonly stop = output<void>();

  /** Uniform tooltip for every visibly-disabled control. */
  protected readonly comingSoon = 'Coming in a later milestone';

  /** Send button is enabled iff prompt is non-empty (after trim). */
  protected readonly canSend = computed(() => this.value().trim().length > 0);

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.emitSubmit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (event.metaKey || event.ctrlKey) {
      // ⌘↵ / Ctrl+↵ → send and clear.
      event.preventDefault();
      this.emitSubmit();
      return;
    }
    if (event.shiftKey) {
      // Shift+Enter inserts a newline — let the textarea handle it.
      return;
    }
    // Plain Enter → send + clear.
    event.preventDefault();
    this.emitSubmit();
  }

  protected emitStop(): void {
    this.stop.emit();
  }

  private emitSubmit(): void {
    const prompt = this.value().trim();
    if (!prompt || this.isRunning()) return;
    this.send.emit(prompt);
  }
}
