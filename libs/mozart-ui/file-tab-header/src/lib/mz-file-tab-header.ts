import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type FileTabHeaderPathTruncate = 'start' | 'end';

/**
 * `mz-file-tab-header` — shared layout primitive for the row that sits
 * above a file pane (edit body, diff body, future review surface). Pure
 * layout — three slots, one truncation input.
 *
 * Slots, in DOM order left-to-right:
 *   1. `[mzFileTabHeaderLeading]` — leading icon-button cluster (e.g.
 *      the collapse chevron on `MzFileDiffCard`'s card chrome).
 *   2. default — the path display. Callers project plain text or a
 *      rich render (e.g. rename arrow) here.
 *   3. `[mzFileTabHeaderActions]` — trailing action buttons.
 *
 * `pathTruncate='start'` swaps the path slot to `direction: rtl` so the
 * ellipsis lands at the START — useful for deep file-tab paths where
 * the filename matters more than the workspace prefix.
 */
@Component({
  selector: 'mz-file-tab-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header
      class="border-border/60 flex h-8 items-center gap-1 border-b px-2"
      data-slot="file-tab-header"
    >
      <ng-content select="[mzFileTabHeaderLeading]" />
      <div
        class="min-w-0 flex-1 truncate font-mono text-[11px]"
        [attr.dir]="_pathDir()"
        [style.text-align]="_pathTextAlign()"
        data-slot="file-tab-header-path"
      >
        <ng-content />
      </div>
      <ng-content select="[mzFileTabHeaderActions]" />
    </header>
  `,
})
export class MzFileTabHeader {
  readonly pathTruncate = input<FileTabHeaderPathTruncate>('end');

  protected readonly _pathDir = computed(() =>
    this.pathTruncate() === 'start' ? 'rtl' : null,
  );
  protected readonly _pathTextAlign = computed(() =>
    this.pathTruncate() === 'start' ? 'left' : null,
  );
}
