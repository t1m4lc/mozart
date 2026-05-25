import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
} from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideWrench } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — fallback renderer for any TurnItemKind without a
// specific component yet. Atom 2 shipped this as the universal
// renderer ; atoms 3-4 swapped in kind-specific renderers
// (thinking/file/shell/search) — this remains the catch-all for
// `kind === 'generic'` (MCP tools, unknown providers, …).
//
// Per the per-item collapse pattern (docs/tmp/2026-05-25 §F): when
// the item carries a body (typically a tool result summary), the
// title row is clickable and toggles a scrollable detail view.

@Component({
  selector: 'mz-generic-tool-renderer',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideWrench })],
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
        name="lucideWrench"
        size="xs"
        [class]="_iconClass()"
      />
      <div>
        <button
          type="button"
          (click)="_toggle()"
          [disabled]="!_hasBody()"
          class="flex w-full cursor-pointer items-center gap-2 text-left text-sm transition-colors enabled:hover:text-foreground disabled:cursor-default"
          [class.shimmer-text]="_isActive()"
          [class.text-destructive]="_isError()"
          [class.text-foreground]="_isDone() && !_isError()"
          [class.text-muted-foreground]="!_isDone() && !_isActive() && !_isError()"
        >
          <span>{{ item().title }}</span>
        </button>
        @if (_hasBody()) {
          <div
            class="generic-body grid"
            [style.grid-template-rows]="_expanded() ? '1fr' : '0fr'"
          >
            <div class="min-h-0 overflow-hidden">
              <pre
                class="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/30 p-2 font-mono text-xs text-muted-foreground"
              >{{ item().body }}</pre>
            </div>
          </div>
        }
      </div>
    </mz-timeline-item>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      .generic-body { transition: grid-template-rows 200ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .generic-body { transition: none; }
      }
    `,
  ],
})
export class GenericToolRenderer {
  readonly item = input.required<TurnItem>();
  readonly showSpacer = input<boolean>(true);
  readonly showConnector = input<boolean>(true);

  protected readonly _isActive = computed(
    () => this.item().state === 'active',
  );
  protected readonly _isError = computed(() => this.item().state === 'error');
  protected readonly _isDone = computed(() => this.item().state === 'done');
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
