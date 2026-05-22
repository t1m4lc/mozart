import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideClock } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — thinking renderer. Per spec §A.5 the reasoning body
// collapses to 200px with a bottom fade gradient and a "Show more"
// affordance that only appears when content actually overflows that
// height. Expanded shows up to 600px, then animates to none.
// max-height transition is 300ms ease-out (instantaneous under
// prefers-reduced-motion).

const COLLAPSED_PX = 200;
const EXPANDED_PX = 600;

@Component({
  selector: 'mz-thinking-renderer',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideClock })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <mz-timeline-item
      [showSpacer]="showSpacer()"
      [showConnector]="showConnector()"
    >
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideClock"
        size="xs"
        [class]="_iconClass()"
      />
      <div>
        <p
          class="text-sm"
          [class.shimmer-text]="_isActive()"
          [class.text-muted-foreground]="!_isActive()"
        >
          {{ item().title || 'Thinking' }}
        </p>
        @if (_hasBody()) {
          <div
            #body
            class="thinking-body relative mt-1 overflow-hidden text-sm leading-relaxed text-muted-foreground"
            [style.max-height.px]="_expanded() ? _expandedHeight() : _collapsedPx"
          >
            <p class="whitespace-pre-wrap">{{ item().body }}</p>
            @if (!_expanded() && _overflows()) {
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
              ></div>
            }
          </div>
          @if (_overflows()) {
            <button
              type="button"
              (click)="_toggle()"
              class="mt-1 cursor-pointer text-xs text-muted-foreground/80 transition-colors hover:text-foreground"
            >
              {{ _expanded() ? 'Hide' : 'Show more' }}
            </button>
          }
        }
      </div>
    </mz-timeline-item>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      .thinking-body { transition: max-height 300ms ease-out; }
      @media (prefers-reduced-motion: reduce) {
        .thinking-body { transition: none; }
      }
    `,
  ],
})
export class ThinkingRenderer {
  readonly item = input.required<TurnItem>();
  readonly showSpacer = input<boolean>(true);
  readonly showConnector = input<boolean>(true);

  protected readonly _collapsedPx = COLLAPSED_PX;

  protected readonly _isActive = computed(
    () => this.item().state === 'active',
  );
  protected readonly _hasBody = computed(
    () => (this.item().body?.length ?? 0) > 0,
  );
  protected readonly _iconClass = computed(() => {
    const state = this.item().state;
    if (state === 'error') return 'text-destructive';
    if (state === 'active') return 'text-foreground';
    return 'text-muted-foreground';
  });

  protected readonly _expanded = linkedSignal<TurnItem, boolean>({
    source: () => this.item(),
    computation: (item, prev) => item.defaultExpanded ?? prev?.value ?? false,
  });
  protected readonly _overflows = signal(false);

  // Cap expanded height at EXPANDED_PX initially; promote to the
  // measured natural height after the first transition completes so
  // very-long reasoning blocks reveal in full (spec §A.5).
  protected readonly _expandedHeight = computed(() =>
    Math.max(EXPANDED_PX, this._naturalHeight()),
  );
  private readonly _naturalHeight = signal(0);

  private readonly _bodyEl = viewChild<ElementRef<HTMLDivElement>>('body');

  constructor() {
    // Measure overflow whenever the body content changes. Re-runs on
    // each text delta during streaming (cheap; just reads
    // scrollHeight after a microtask).
    effect(() => {
      void this.item().body;
      const el = this._bodyEl()?.nativeElement;
      if (!el) return;
      queueMicrotask(() => {
        this._overflows.set(el.scrollHeight > COLLAPSED_PX);
        this._naturalHeight.set(el.scrollHeight);
      });
    });
  }

  protected _toggle(): void {
    this._expanded.update((v) => !v);
  }
}
