import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleX,
} from '@ng-icons/lucide';
import { HlmTimelineDoneMarker } from './hlm-timeline-done-marker';
import { HlmTimelineItem } from './hlm-timeline-item';
import type {
  TimelineFileChipClick,
  TimelineItemExpandedChange,
  TimelineTurn,
} from './hlm-timeline.types';

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

@Component({
  selector: 'hlm-timeline',
  imports: [
    NgIcon,
    HlmIconImports,
    HlmTimelineItem,
    HlmTimelineDoneMarker,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronRight,
      lucideCircleCheck,
      lucideCircleX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="flex flex-col">
      <button
        type="button"
        class="-mx-1 inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        [attr.aria-expanded]="!collapsed()"
        aria-label="Toggle timeline"
        (click)="_toggleCollapsed()"
      >
        <ng-icon
          hlm
          [name]="collapsed() ? 'lucideChevronRight' : 'lucideChevronDown'"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />

        @if (turn().isStreaming) {
          <span
            class="hlm-cli-spinner shrink-0 text-muted-foreground"
            aria-hidden="true"
          ></span>
        } @else if (turn().outcome === 'error') {
          <ng-icon
            hlm
            name="lucideCircleX"
            size="xs"
            class="shrink-0 text-destructive"
          />
        } @else {
          <ng-icon
            hlm
            name="lucideCircleCheck"
            size="xs"
            [class]="_completionIconClass()"
          />
        }

        <h3
          class="min-w-0 truncate text-sm font-medium"
          [class.hlm-shimmer-text]="turn().isStreaming"
        >
          {{ _headerText() }}
        </h3>
      </button>

      <div
        class="hlm-timeline-body"
        [attr.data-collapsed]="collapsed()"
      >
        <div class="hlm-timeline-body-inner pt-3 pl-1">
          @for (item of turn().items; track item.id; let idx = $index) {
            <hlm-timeline-item
              [item]="item"
              [isLast]="
                idx === turn().items.length - 1 && !turn().showDoneMarker
              "
              (fileChipClick)="_onFileChipClick($event)"
              (expandedChange)="_onItemExpandedChange($event)"
            />
          }
          @if (turn().showDoneMarker) {
            <hlm-timeline-done-marker />
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    @keyframes hlm-shimmer-text {
      0%   { background-position: 100% 50%; }
      100% { background-position: -100% 50%; }
    }
    .hlm-shimmer-text {
      background: linear-gradient(
        90deg,
        currentColor 0%,
        currentColor 30%,
        color-mix(in srgb, currentColor 30%, transparent) 50%,
        currentColor 70%,
        currentColor 100%
      );
      background-size: 400% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: hlm-shimmer-text 2.25s linear infinite;
    }

    /* CLI braille spinner — 8 frames cycling at 800 ms. */
    @keyframes hlm-cli-spinner-cycle {
      0%     { content: '⣼'; }
      12.5%  { content: '⣹'; }
      25%    { content: '⢻'; }
      37.5%  { content: '⠿'; }
      50%    { content: '⡟'; }
      62.5%  { content: '⣏'; }
      75%    { content: '⣧'; }
      87.5%  { content: '⣶'; }
      100%   { content: '⣼'; }
    }
    .hlm-cli-spinner {
      display: inline-block;
      width: 1em;
      line-height: 1;
      text-align: center;
      font-family: var(--font-mono, monospace);
    }
    .hlm-cli-spinner::before {
      content: '⣼';
      animation: hlm-cli-spinner-cycle 800ms steps(8, end) infinite;
    }

    .hlm-timeline-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 220ms ease, opacity 220ms ease;
      opacity: 1;
    }
    .hlm-timeline-body[data-collapsed='true'] {
      grid-template-rows: 0fr;
      opacity: 0;
    }
    .hlm-timeline-body > .hlm-timeline-body-inner {
      min-height: 0;
      overflow: hidden;
    }
    @media (prefers-reduced-motion: reduce) {
      .hlm-shimmer-text {
        background: none;
        color: var(--muted-foreground);
        animation: none;
      }
      .hlm-cli-spinner::before {
        animation: none;
      }
      .hlm-timeline-body {
        transition: none;
      }
    }
  `,
})
export class HlmTimeline {
  readonly turn = input.required<TimelineTurn>();
  readonly collapsed = model(false);

  readonly fileChipClick = output<TimelineFileChipClick>();
  readonly itemExpandedChange = output<TimelineItemExpandedChange>();

  protected readonly _headerText = computed(() => {
    const t = this.turn();
    if (t.isStreaming) return t.summary || 'Thinking…';
    const elapsed =
      t.elapsedMs !== undefined ? ` · ${formatDuration(t.elapsedMs)}` : '';
    switch (t.outcome) {
      case 'error':
        return `Failed${elapsed}`;
      case 'stopped':
        return `Stopped${elapsed}`;
      case 'done':
      default:
        return `Thought for ${formatDuration(t.elapsedMs ?? 0)}`;
    }
  });

  protected readonly _completionIconClass = computed(() => {
    switch (this.turn().outcome) {
      case 'stopped':
        return 'shrink-0 text-muted-foreground';
      case 'done':
      default:
        return 'shrink-0 text-green-600 dark:text-green-400';
    }
  });

  protected _toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  protected _onFileChipClick(event: TimelineFileChipClick): void {
    this.fileChipClick.emit(event);
  }

  protected _onItemExpandedChange(event: TimelineItemExpandedChange): void {
    this.itemExpandedChange.emit(event);
  }
}
