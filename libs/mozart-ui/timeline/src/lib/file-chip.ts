import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { TurnFileChip } from './turn-state.types';

export type FileChipVariant = 'read' | 'edit' | 'create' | 'delete';

// Phase 3b — bordered file chip per spec §A.4. The path is shown in
// monospace with ellipsis on overflow; for `edit` variants the
// internal divider separates the path from the +N/−N diff stats.
// `create` variants get a subtle green border tint + "new" suffix;
// `delete` strikes through the path name.
//
// Click emits the raw path string. Host (AgentMessage) decides where
// it goes — copy to clipboard in v0.1.0-beta.1, route to a diff aside once
// that lands.

@Component({
  selector: 'mz-file-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    <button
      type="button"
      (click)="chipClick.emit(chip().label)"
      [attr.title]="chip().label"
      class="file-chip group/chip inline-flex max-w-xs cursor-pointer items-center overflow-hidden rounded-md border border-border bg-background font-mono text-xs text-foreground transition-colors hover:border-muted-foreground hover:bg-card"
      [class.is-create]="variant() === 'create'"
      [class.is-delete]="variant() === 'delete'"
    >
      <span
        class="chip-name truncate border-r border-border px-1.5 py-0.5"
        [class.line-through]="variant() === 'delete'"
      >
        {{ chip().label }}
      </span>
      @if (variant() === 'edit') {
        @if (_hasAdded()) {
          <span class="px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-500"
            >+{{ chip().added }}</span
          >
        }
        @if (_hasRemoved()) {
          <span
            class="border-l border-border px-1.5 py-0.5 font-medium text-destructive"
            >−{{ chip().removed }}</span
          >
        }
      } @else if (variant() === 'create') {
        <span
          class="px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-500"
          >new</span
        >
      }
    </button>
  `,
  styles: `
    .file-chip.is-create { border-color: color-mix(in oklch, var(--brand) 35%, var(--border)); }
    .file-chip.is-create:hover { border-color: color-mix(in oklch, var(--brand) 70%, var(--border)); }
    .file-chip.is-delete { border-color: color-mix(in oklch, var(--destructive) 30%, var(--border)); }
  `,
})
export class FileChip {
  readonly chip = input.required<TurnFileChip>();
  readonly variant = input<FileChipVariant>('read');
  readonly chipClick = output<string>();

  protected readonly _hasAdded = computed(() => (this.chip().added ?? 0) > 0);
  protected readonly _hasRemoved = computed(
    () => (this.chip().removed ?? 0) > 0,
  );
}
