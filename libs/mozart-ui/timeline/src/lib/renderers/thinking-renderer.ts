import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideClock } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — thinking renderer. Title row is the human-readable
// "Thinking" label ; the cumulative reasoning text is the body and
// stays collapsed by default (matches the per-item collapse pattern
// of search/generic — ChatGPT-style: title visible, body hidden
// behind a click on the title row). When expanded the body is
// rendered in a scrollable container capped by max-height so very
// long reasoning blocks don't blow up the timeline.

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
        <button
          type="button"
          (click)="_toggle()"
          [disabled]="!_hasBody()"
          class="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-muted-foreground transition-colors enabled:hover:text-foreground disabled:cursor-default"
        >
          <span [class.shimmer-text]="_isActive()">
            {{ item().title || 'Thinking' }}
          </span>
        </button>
        @if (_hasBody()) {
          <div
            class="thinking-body grid"
            [style.grid-template-rows]="_expanded() ? '1fr' : '0fr'"
          >
            <div class="min-h-0 overflow-hidden">
              <p
                class="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
              >{{ item().body }}</p>
            </div>
          </div>
        }
      </div>
    </mz-timeline-item>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      .thinking-body { transition: grid-template-rows 200ms ease; }
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

  protected _toggle(): void {
    if (!this._hasBody()) return;
    this._expanded.update((v) => !v);
  }
}
