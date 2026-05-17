import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

// Phase 3b — visual chrome for a single timeline row. Renderers
// compose <mz-timeline-item> internally and project their gutter
// icon + body content into the named slots. Geometry follows the
// Claude.ai reference (spec §A.3, §A.7.4):
//
//   - 20px gutter column, centered icon at top, 1px vertical line
//     filling the column below the icon.
//   - 8px spacer row above (with the same gutter line), drawn unless
//     the host explicitly disables it for the first row.
//   - Connector below is opt-out (done-marker uses this — §A.6).
//
// Connector segments are rendered per-row (not as one absolute line)
// so the visual rhythm stays correct when items expand/collapse.

@Component({
  selector: 'mz-timeline-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (showSpacer()) {
      <div class="flex h-2 flex-row" aria-hidden="true">
        <div class="flex w-5 shrink-0 justify-center">
          <div class="h-full w-px bg-border"></div>
        </div>
      </div>
    }
    <div class="flex flex-row">
      <div class="flex w-5 shrink-0 justify-center">
        <div class="flex flex-col items-center pt-1">
          <ng-content select="[hlmRowIcon]" />
          @if (showConnector()) {
            <div class="mt-1 w-px flex-1 bg-border"></div>
          }
        </div>
      </div>
      <div class="min-w-0 flex-1 px-2 pt-0.5">
        <ng-content />
      </div>
    </div>
  `,
})
export class TimelineItem {
  // Draw the 8px connector spacer above this row. Default true; the
  // first row of a timeline can pass false to butt up against the
  // message body cleanly.
  readonly showSpacer = input<boolean>(true);
  // Draw the gutter line BELOW the icon. Default true; the
  // done-marker (last row) passes false per spec §A.6.
  readonly showConnector = input<boolean>(true);
}
