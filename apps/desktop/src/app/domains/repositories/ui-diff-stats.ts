import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Reusable `+N -N` diff-stat pair, GitHub-style. Renders nothing when
// both counts are zero so callers don't need to wrap with @if. Mono
// font + tabular-nums keeps the two numbers visually anchored regardless
// of digit width.
@Component({
  selector: 'app-ui-diff-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (_hasAny()) {
      <span
        class="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums"
        [attr.aria-label]="_ariaLabel()"
      >
        @if (added() > 0) {
          <span class="text-emerald-600 dark:text-emerald-500"
            >+{{ added() }}</span
          >
        }
        @if (removed() > 0) {
          <span class="text-red-600 dark:text-red-500">−{{ removed() }}</span>
        }
      </span>
    }
  `,
})
export class UiDiffStats {
  readonly added = input<number>(0);
  readonly removed = input<number>(0);

  protected readonly _hasAny = computed(
    () => this.added() > 0 || this.removed() > 0,
  );

  protected readonly _ariaLabel = computed(() => {
    const a = this.added();
    const r = this.removed();
    const parts: string[] = [];
    if (a > 0) parts.push(`${a} added`);
    if (r > 0) parts.push(`${r} removed`);
    return parts.join(', ');
  });
}
