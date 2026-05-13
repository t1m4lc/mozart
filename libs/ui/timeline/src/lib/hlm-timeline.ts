import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronRight } from '@ng-icons/lucide';
import { HlmTimelineDoneMarker } from './hlm-timeline-done-marker';
import { HlmTimelineItem } from './hlm-timeline-item';
import type {
  TimelineFileChipClick,
  TimelineItemExpandedChange,
  TimelineTurn,
} from './hlm-timeline.types';

@Component({
  selector: 'hlm-timeline',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTimelineItem,
    HlmTimelineDoneMarker,
  ],
  providers: [
    provideIcons({ lucideChevronDown, lucideChevronRight }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="flex flex-col">
      <header class="flex items-center gap-2">
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          [attr.aria-expanded]="!collapsed()"
          aria-label="Toggle timeline"
          class="shrink-0"
          (click)="_toggleCollapsed()"
        >
          <ng-icon
            hlm
            [name]="
              collapsed() ? 'lucideChevronRight' : 'lucideChevronDown'
            "
            size="xs"
            class="text-muted-foreground"
          />
        </button>
        <h3
          class="min-w-0 flex-1 truncate text-sm font-medium"
          [class.hlm-shimmer-text]="turn().isStreaming"
        >
          {{ turn().summary }}
        </h3>
      </header>

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
    .hlm-timeline-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 200ms ease;
    }
    .hlm-timeline-body[data-collapsed='true'] {
      grid-template-rows: 0fr;
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
