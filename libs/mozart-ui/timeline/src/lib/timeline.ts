import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type Type,
} from '@angular/core';
import { TOOL_RENDERERS } from './renderers/tool-renderers.registry';
import type { TurnItem } from './turn-state.types';

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

  protected readonly _rows = computed<readonly TimelineRow[]>(() => {
    const items = this.items();
    return items.map((item, index) => ({
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
