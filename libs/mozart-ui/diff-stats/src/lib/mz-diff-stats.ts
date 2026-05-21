import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'mz-diff-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex items-center gap-1 font-mono text-[10px] tracking-widest tabular-nums',
    '[hidden]': '!_hasDiff()',
    '[attr.aria-label]': '_ariaLabel()',
  },
  template: `
    @if (added() > 0) {
      <span class="text-emerald-600 dark:text-emerald-500">+{{ added() }}</span>
    }
    @if (removed() > 0) {
      <span class="text-red-600 dark:text-red-500">−{{ removed() }}</span>
    }
  `,
})
export class MzDiffStats {
  readonly added = input<number>(0);
  readonly removed = input<number>(0);

  protected readonly _hasDiff = computed(
    () => this.added() > 0 || this.removed() > 0,
  );

  protected readonly _ariaLabel = computed(() => {
    const a = this.added();
    const r = this.removed();
    const parts: string[] = [];
    if (a > 0) parts.push(`${a} added`);
    if (r > 0) parts.push(`${r} removed`);
    return parts.length === 0 ? null : parts.join(', ');
  });
}
