import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `mz-file-tab-header` — shared layout primitive for the row that sits
 * above a file pane (edit body, diff body, future review surface). Pure
 * layout — three slots, no state.
 *
 * Slots, in DOM order left-to-right:
 *   1. `[mzFileTabHeaderLeading]` — leading icon-button cluster (e.g.
 *      the collapse chevron on `MzFileDiffCard`'s card chrome).
 *   2. default — the path display. Callers project plain text or a
 *      rich render (e.g. rename arrow) here.
 *   3. `[mzFileTabHeaderActions]` — trailing action buttons (Diff/Edit
 *      toggle, Viewed, copy, refresh, etc).
 *
 * No inputs. No outputs. Callers wire whatever they need into the
 * slots. The host class keeps typography + height consistent across
 * Edit and Diff surfaces.
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
        data-slot="file-tab-header-path"
      >
        <ng-content />
      </div>
      <ng-content select="[mzFileTabHeaderActions]" />
    </header>
  `,
})
export class MzFileTabHeader {}
