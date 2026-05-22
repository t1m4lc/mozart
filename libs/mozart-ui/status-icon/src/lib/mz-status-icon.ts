import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type MzStatusIconStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'canceled';

const STATUS_LABEL: Record<MzStatusIconStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  canceled: 'Canceled',
};

// Linear-inspired palette, expressed as Tailwind utilities so the same
// class drives both the outline ring and the inner wedge through
// `currentColor`, and dark mode falls out of the design tokens.
const STATUS_COLOR: Record<MzStatusIconStatus, string> = {
  backlog: 'text-muted-foreground/60',
  todo: 'text-muted-foreground',
  in_progress: 'text-amber-500',
  in_review: 'text-sky-500',
  done: 'text-indigo-500',
  canceled: 'text-muted-foreground/70',
};

@Component({
  selector: 'mz-status-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center rounded-full',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      [class]="colorClass()"
    >
      @switch (status()) {
        @case ('backlog') {
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-dasharray="2.2 2.2"
          />
        }
        @case ('todo') {
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
        }
        @case ('in_progress') {
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path d="M8 8 L8 4 A4 4 0 0 1 8 12 Z" fill="currentColor" />
        }
        @case ('in_review') {
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path d="M8 8 L8 4 A4 4 0 1 1 4 8 Z" fill="currentColor" />
        }
        @case ('done') {
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.3 L7 10.3 L11 5.9"
            class="stroke-background"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        }
        @case ('canceled') {
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5"
            class="stroke-background"
            stroke-width="1.6"
            stroke-linecap="round"
            fill="none"
          />
        }
      }
    </svg>
  `,
})
export class MzStatusIcon {
  readonly status = input.required<MzStatusIconStatus>();
  readonly size = input<number>(16);

  protected readonly colorClass = computed(() => STATUS_COLOR[this.status()]);
  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
}
