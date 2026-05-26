import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type Type,
} from '@angular/core';
import { isItemVisibleAt } from './_density.util';
import { TOOL_RENDERERS } from './renderers/tool-renderers.registry';
import type { TurnItem } from './turn-state.types';
import type { TimelineDensity } from './turn-state.types';

// Phase 3b — vertical timeline of agent activity. Renders each item
// via the renderer registry (kind → component, dispatched through
// NgComponentOutlet). Items are append-only and keyed by `id`
// (spec §9.1 — re-rendering must produce identical output).
//
// The Done/Error terminal marker is rendered by the parent
// TurnContainer (not here), so the marker can sit at the absolute
// bottom of the turn body — i.e. *after* the assistant's text
// response, which itself is rendered between the timeline and the
// marker. Putting the marker inside this component would lock it to
// the end of the items list, above the text.
//
// `density` filters the input items in-place — the host's TurnState
// is never mutated. Filter rules (docs/tmp/2026-05-25 §C):
//   - errors AND `result`-role items: always visible
//   - `compact`: nothing else
//   - `normal`: `detail` items whose kind is in PROMOTE_TO_NORMAL
//   - `detailed`: every item

interface TimelineRow {
  readonly item: TurnItem;
  readonly component: Type<unknown>;
  readonly showSpacer: boolean;
  readonly showConnector: boolean;
}

@Component({
  selector: 'mz-timeline',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col' },
  template: `
    @for (row of _rows(); track row.item.id; let last = $last) {
      <ng-container
        *ngComponentOutlet="
          row.component;
          inputs: {
            item: row.item,
            showSpacer: row.showSpacer,
            showConnector: !last
          }
        "
      />
    }
  `,
})
export class Timeline {
  readonly items = input.required<readonly TurnItem[]>();
  readonly density = input<TimelineDensity>('normal');

  protected readonly _rows = computed<readonly TimelineRow[]>(() => {
    const level = this.density();
    const visible = this.items().filter((item) =>
      isItemVisibleAt(item, level),
    );
    return visible.map((item, index) => ({
      item,
      component: TOOL_RENDERERS[item.kind] ?? TOOL_RENDERERS.generic,
      // First row joins the message body above without a spacer; the
      // rest get the 8px connector spacer (per spec §A.3 / §A.7.4).
      showSpacer: index > 0,
      // showConnector is overridden per row in the template using $last
      // so the visually-last item stops its trailing line cleanly.
      showConnector: true,
    }));
  });
}
