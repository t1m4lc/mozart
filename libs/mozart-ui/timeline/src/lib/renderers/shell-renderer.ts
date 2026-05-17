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
import { lucideTerminal } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — shell renderer. Shows the command in the title row and
// the captured stdout/stderr in a mono block. Default expanded if a
// body is present (the user usually wants to see the output without
// an extra click); collapsible via the title row.

@Component({
  selector: 'hlm-shell-renderer',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideTerminal })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <hlm-timeline-item
      [showSpacer]="showSpacer()"
      [showConnector]="showConnector()"
    >
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideTerminal"
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
          <code
            class="font-mono text-xs"
            [class.shimmer-text]="_isActive()"
          >{{ item().title }}</code>
        </button>
        @if (_hasBody()) {
          <div
            class="shell-body grid"
            [style.grid-template-rows]="_expanded() ? '1fr' : '0fr'"
          >
            <div class="min-h-0 overflow-hidden">
              <pre
                class="mt-1 whitespace-pre-wrap break-all rounded-md border border-border bg-muted/30 p-2 font-mono text-xs text-muted-foreground"
              >{{ item().body }}</pre>
            </div>
          </div>
        }
      </div>
    </hlm-timeline-item>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      .shell-body { transition: grid-template-rows 200ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .shell-body { transition: none; }
      }
    `,
  ],
})
export class ShellRenderer {
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

  protected readonly _expanded = signal(true);

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
