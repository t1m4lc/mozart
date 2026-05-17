import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideWrench } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — fallback renderer for any TurnItemKind without a
// specific component yet. Atom 2 ships this as the universal renderer
// (every kind in the registry maps here). Atoms 3-4 swap in the
// kind-specific renderers (thinking/file/shell/search) — this
// remains the catch-all for `kind === 'generic'`.

@Component({
  selector: 'hlm-generic-tool-renderer',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideWrench })],
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
        name="lucideWrench"
        size="xs"
        [class]="_iconClass()"
      />
      <p
        class="text-sm"
        [class.shimmer-text]="_isActive()"
        [class.text-destructive]="_isError()"
        [class.text-foreground]="_isDone()"
      >
        {{ item().title }}
      </p>
    </hlm-timeline-item>
  `,
  styles: [SHIMMER_TEXT_STYLES],
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

  protected readonly _iconClass = computed(() => {
    const state = this.item().state;
    if (state === 'error') return 'text-destructive';
    if (state === 'active') return 'text-foreground';
    return 'text-muted-foreground';
  });
}
