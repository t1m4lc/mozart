import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronRight,
  lucideCircleX,
  lucideClock,
  lucideFilePen,
  lucideFilePlus,
  lucideFileText,
  lucideSearch,
  lucideTerminal,
  lucideWrench,
} from '@ng-icons/lucide';
import type {
  TimelineFileChipClick,
  TimelineItem,
  TimelineItemExpandedChange,
  TimelineItemKind,
  TimelineItemState,
} from './hlm-timeline.types';

const KIND_ICON: Record<TimelineItemKind, string> = {
  thinking: 'lucideClock',
  'file-read': 'lucideFileText',
  'file-edit': 'lucideFilePen',
  'file-create': 'lucideFilePlus',
  shell: 'lucideTerminal',
  search: 'lucideSearch',
  generic: 'lucideWrench',
};

const STATE_ICON_CLASS: Record<TimelineItemState, string> = {
  pending: 'text-muted-foreground/60',
  active: 'text-foreground',
  done: 'text-muted-foreground',
  error: 'text-destructive',
};

const STATE_TITLE_CLASS: Record<TimelineItemState, string> = {
  pending: 'text-muted-foreground/60',
  active: 'text-foreground',
  done: 'text-foreground',
  error: 'text-destructive',
};

@Component({
  selector: 'hlm-timeline-item',
  imports: [NgIcon, HlmIconImports, HlmSpinnerImports],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronRight,
      lucideCircleX,
      lucideClock,
      lucideFilePen,
      lucideFilePlus,
      lucideFileText,
      lucideSearch,
      lucideTerminal,
      lucideWrench,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-3">
      <div class="relative flex w-5 shrink-0 justify-center pt-0.5">
        @if (!isLast()) {
          <span
            class="pointer-events-none absolute left-1/2 top-6 bottom-0 w-px -translate-x-1/2 bg-border"
            aria-hidden="true"
          ></span>
        }
        @if (item().state === 'error') {
          <ng-icon
            hlm
            name="lucideCircleX"
            size="sm"
            [class]="_iconClass()"
          />
        } @else if (item().state === 'active') {
          <hlm-spinner
            aria-label="Running"
            class="text-foreground"
          />
        } @else {
          <ng-icon hlm [name]="_iconName()" size="sm" [class]="_iconClass()" />
        }
      </div>

      <div class="min-w-0 flex-1 pb-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left text-sm rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          (click)="_toggleExpanded()"
        >
          <span
            class="inline-flex items-center gap-1"
            [class]="_titleClass()"
          >
            <span [class.hlm-shimmer-text]="item().state === 'active'">{{ item().title }}</span>
            @if (item().body) {
              <ng-icon
                hlm
                [name]="
                  _expanded() ? 'lucideChevronDown' : 'lucideChevronRight'
                "
                size="xs"
                class="text-muted-foreground"
              />
            }
          </span>

          @if (item().fileChip; as chip) {
            <button
              type="button"
              class="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-muted/60 px-1.5 font-mono text-xs text-foreground hover:bg-muted"
              (click)="_onFileChipClick($event, chip.label)"
            >
              <span class="truncate">{{ chip.label }}</span>
            </button>

            @if (chip.added !== undefined || chip.removed !== undefined) {
              <span
                class="inline-flex shrink-0 items-center gap-1.5 font-mono text-xs"
              >
                @if (chip.added !== undefined) {
                  <span class="text-green-600 dark:text-green-400"
                    >+{{ chip.added }}</span
                  >
                }
                @if (chip.removed !== undefined) {
                  <span class="text-destructive"
                    >−{{ chip.removed }}</span
                  >
                }
              </span>
            }
          }
        </button>

        @if (_expanded() && item().body; as body) {
          <pre
            class="hlm-timeline-body mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-xs text-muted-foreground"
            >{{ body }}</pre
          >
        }
      </div>
    </div>
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
    @media (prefers-reduced-motion: reduce) {
      .hlm-shimmer-text {
        background: none;
        color: var(--muted-foreground);
        animation: none;
      }
    }
  `,
})
export class HlmTimelineItem {
  readonly item = input.required<TimelineItem>();
  readonly isLast = input(false);

  readonly fileChipClick = output<TimelineFileChipClick>();
  readonly expandedChange = output<TimelineItemExpandedChange>();

  protected readonly _expanded = signal(false);

  constructor() {
    queueMicrotask(() => {
      const item = this.item();
      const initial =
        item.defaultExpanded ??
        (item.state === 'error' || item.kind === 'file-edit');
      this._expanded.set(initial);
    });
  }

  protected readonly _iconName = computed(() => KIND_ICON[this.item().kind]);

  protected readonly _iconClass = computed(
    () => STATE_ICON_CLASS[this.item().state],
  );

  protected readonly _titleClass = computed(
    () => STATE_TITLE_CLASS[this.item().state],
  );

  protected _toggleExpanded(): void {
    if (!this.item().body) return;
    const next = !this._expanded();
    this._expanded.set(next);
    this.expandedChange.emit({ itemId: this.item().id, expanded: next });
  }

  protected _onFileChipClick(event: MouseEvent, label: string): void {
    event.stopPropagation();
    this.fileChipClick.emit({ itemId: this.item().id, label });
  }
}
