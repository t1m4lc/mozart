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
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideGauge,
  lucideHash,
  lucideLink,
  lucidePaperclip,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmKbdImports } from '@mozart/ui/kbd';
import { HlmTextareaImports } from '@mozart/ui/textarea';
import { HlmToggleGroupImports } from '@mozart/ui/toggle-group';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

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
  template: `
    <form class="composer" (submit)="onSubmit($event)">
      <textarea
        hlmTextarea
        class="composer-textarea"
        [ngModel]="value()"
        (ngModelChange)="value.set($event)"
        [disabled]="isRunning()"
        name="prompt"
        [placeholder]="placeholder()"
        rows="3"
        (keydown)="onKeydown($event)"
      ></textarea>

      <div class="toolbar">
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
          class="toolbar-btn"
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
          class="toolbar-btn"
        >
          <ng-icon name="lucideGauge" class="toolbar-icon" />
          <span>Effort</span>
        </button>
        <ng-template #effortMenu>
          <hlm-dropdown-menu></hlm-dropdown-menu>
        </ng-template>

        <span
          class="mode-toggle-wrap"
          [hlmTooltip]="comingSoon"
        >
          <hlm-toggle-group
            class="mode-toggle"
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

        <span class="separator" aria-hidden="true"></span>

        <!-- Middle group: attachments / links / issues -->
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
          aria-label="Attach file"
          class="toolbar-icon-btn"
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
          class="toolbar-icon-btn"
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
          class="toolbar-icon-btn"
        >
          <ng-icon name="lucideHash" />
        </button>

        <span class="spacer"></span>

        <!-- Right group: kbd hint + Send / Stop -->
        <span class="kbd-hint" aria-hidden="true">
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
    :host {
      display: block;
    }
    .composer {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid hsl(var(--border));
      background: var(--bg-composer, hsl(var(--card)));
    }
    /* hlmTextarea owns border + focus ring; we only constrain sizing. */
    .composer-textarea {
      resize: vertical;
      min-height: 64px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .toolbar-btn,
    .toolbar-icon-btn {
      color: hsl(var(--muted-foreground));
    }
    .toolbar-icon {
      --ng-icon__size: 14px;
    }
    .mode-toggle-wrap {
      display: inline-flex;
      align-items: center;
      margin-left: 2px;
      margin-right: 2px;
    }
    .mode-toggle {
      opacity: 1;
    }
    .separator {
      display: inline-block;
      width: 1px;
      height: 20px;
      background: hsl(var(--border));
      margin: 0 6px;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .kbd-hint {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-right: 6px;
      color: hsl(var(--muted-foreground));
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
