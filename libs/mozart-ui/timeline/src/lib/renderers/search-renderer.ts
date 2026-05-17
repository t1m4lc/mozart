import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — search renderer (grep / glob / web_search). Title row
// is the query/pattern; collapsible body shows the result summary.
// Default collapsed — searches are usually a "happened" signal, the
// user only opens them when investigating.

@Component({
  selector: 'mz-search-renderer',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideSearch })],
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
        name="lucideSearch"
        size="xs"
        [class]="_iconClass()"
      />
      <div>
        <button
          type="button"
          (click)="_toggle()"
          [disabled]="!_hasBody()"
          class="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-muted-foreground transition-colors enabled:hover:text-foreground disabled:cursor-default"
          [class.text-destructive]="_isError()"
        >
          <span [class.shimmer-text]="_isActive()">{{ item().title }}</span>
        </button>
        @if (_hasBody()) {
          <div
            class="search-body grid"
            [style.grid-template-rows]="_expanded() ? '1fr' : '0fr'"
          >
            <div class="min-h-0 overflow-hidden">
              <p
                class="mt-1 whitespace-pre-wrap text-xs text-muted-foreground"
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
      .search-body { transition: grid-template-rows 200ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .search-body { transition: none; }
      }
    `,
  ],
})
export class SearchRenderer {
  readonly item = input.required<TurnItem>();
  readonly showSpacer = input<boolean>(true);
  readonly showConnector = input<boolean>(true);

  protected readonly _isActive = computed(
    () => this.item().state === 'active',
  );
  protected readonly _isError = computed(() => this.item().state === 'error');
  protected readonly _hasBody = computed(
    () => (this.item().body?.length ?? 0) > 0,
  );
  protected readonly _iconClass = computed(() => {
    const state = this.item().state;
    if (state === 'error') return 'text-destructive';
    if (state === 'active') return 'text-foreground';
    return 'text-muted-foreground';
  });

  protected readonly _expanded = signal(false);

  constructor() {
    effect(() => {
      const def = this.item().defaultExpanded;
      if (def !== undefined) this._expanded.set(def);
    });
  }

  protected _toggle(): void {
    if (!this._hasBody()) return;
    this._expanded.update((v) => !v);
  }
}
