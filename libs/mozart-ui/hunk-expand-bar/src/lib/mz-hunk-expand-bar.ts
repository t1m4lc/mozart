import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronUp } from '@ng-icons/lucide';

export type HunkExpandDirection = 'up' | 'down' | 'both';

export interface HunkExpandEvent {
  /** Which arrow the user clicked. */
  readonly direction: 'up' | 'down';
  /** Number of context lines to reveal, capped at `linesAvailable`. */
  readonly count: number;
}

const DEFAULT_STEP = 10;

// Dumb expand-bar between or above/below diff hunks. Single bar with up
// to two arrow buttons. Knows nothing about hunks, fetches, or diff
// state — emits a typed event so the renderer decides where the new
// context lands. Shift-click on either arrow doubles the step.
@Component({
  selector: 'mz-hunk-expand-bar',
  imports: [NgIcon, HlmIconImports, HlmTooltipImports],
  providers: [provideIcons({ lucideChevronUp, lucideChevronDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex h-5 items-center gap-2 border-y border-sidebar-border bg-muted/40 px-2 text-[10px] text-muted-foreground select-none',
    role: 'separator',
    'aria-orientation': 'horizontal',
  },
  template: `
    @if (_showUp()) {
      <button
        type="button"
        class="flex h-4 w-5 items-center justify-center rounded-sm hover:bg-muted/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        [attr.aria-label]="_upAriaLabel()"
        [hlmTooltip]="_hint()"
        [disabled]="linesAvailable() <= 0"
        (click)="emit($event, 'up')"
      >
        <ng-icon hlm name="lucideChevronUp" size="xs" />
      </button>
    } @else {
      <span class="w-5" aria-hidden="true"></span>
    }

    <span class="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted-foreground/70">
      @if (linesAvailable() > 0) {
        @if (linesAvailable() === 1) {
          1 hidden line
        } @else {
          {{ linesAvailable() }} hidden lines
        }
      } @else {
        …
      }
    </span>

    @if (_showDown()) {
      <button
        type="button"
        class="flex h-4 w-5 items-center justify-center rounded-sm hover:bg-muted/80 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        [attr.aria-label]="_downAriaLabel()"
        [hlmTooltip]="_hint()"
        [disabled]="linesAvailable() <= 0"
        (click)="emit($event, 'down')"
      >
        <ng-icon hlm name="lucideChevronDown" size="xs" />
      </button>
    } @else {
      <span class="w-5" aria-hidden="true"></span>
    }
  `,
})
export class MzHunkExpandBar {
  readonly direction = input<HunkExpandDirection>('both');
  /** Number of unchanged lines hidden in the gap this bar covers.
   *  When 0 the bar is purely decorative (and buttons are disabled). */
  readonly linesAvailable = input.required<number>();
  /** Default expansion step in lines. Shift-click doubles. */
  readonly step = input<number>(DEFAULT_STEP);

  readonly expand = output<HunkExpandEvent>();

  protected readonly _showUp = computed(() => {
    const d = this.direction();
    return d === 'up' || d === 'both';
  });

  protected readonly _showDown = computed(() => {
    const d = this.direction();
    return d === 'down' || d === 'both';
  });

  protected readonly _upAriaLabel = computed(
    () => `Show ${this.step()} more lines above`,
  );
  protected readonly _downAriaLabel = computed(
    () => `Show ${this.step()} more lines below`,
  );
  protected readonly _hint = computed(
    () =>
      `Show ${this.step()} more lines — shift-click for ${this.step() * 2}`,
  );

  protected emit(event: MouseEvent, direction: 'up' | 'down'): void {
    const requested = event.shiftKey ? this.step() * 2 : this.step();
    const count = Math.min(this.linesAvailable(), requested);
    if (count <= 0) return;
    this.expand.emit({ direction, count });
  }
}
