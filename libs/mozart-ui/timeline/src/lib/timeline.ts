import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type Type,
} from '@angular/core';
import { isItemVisibleAt } from './_density.util';
import { FileEditGroupRenderer } from './renderers/file-edit-group-renderer';
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
  /** Stable key for *ngFor tracking. For groups, the first item's id
   *  with a `:group` suffix so adding a chip to an existing group
   *  reuses the same DOM node. */
  readonly trackId: string;
  readonly component: Type<unknown>;
  /** Inputs forwarded to the renderer. Single rows pass `{ item }`;
   *  grouped rows pass `{ items }`. Pre-merged with `showSpacer` so
   *  the template only has to append the position-dependent
   *  `showConnector` flag at bind time. */
  readonly inputs: Record<string, unknown>;
  readonly showSpacer: boolean;
}

@Component({
  selector: 'mz-timeline',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col' },
  template: `
    @for (row of _rows(); track row.trackId; let last = $last) {
      <ng-container
        *ngComponentOutlet="
          row.component;
          inputs: row.inputs
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
    return groupConsecutiveEdits(visible);
  });
}

// Fold consecutive `file-edit` items into a single virtual row so
// the timeline doesn't render "edit, edit, edit" cascades. A single
// file-edit stays as the per-item renderer — the group renderer only
// activates when ≥ 2 edits sit next to each other in the filtered
// stream. Every other kind passes through unchanged.
//
// Exported for unit testing.
export function groupConsecutiveEdits(
  items: readonly TurnItem[],
): readonly TimelineRow[] {
  const raw: Array<Omit<TimelineRow, 'inputs'> & { payload: object }> = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === 'file-edit') {
      let j = i + 1;
      while (j < items.length && items[j].kind === 'file-edit') j++;
      const run = items.slice(i, j);
      if (run.length >= 2) {
        raw.push({
          trackId: `${run[0].id}:edit-group`,
          component: FileEditGroupRenderer,
          payload: { items: run },
          showSpacer: raw.length > 0,
        });
        i = j;
        continue;
      }
    }
    raw.push({
      trackId: item.id,
      component: TOOL_RENDERERS[item.kind] ?? TOOL_RENDERERS.generic,
      payload: { item },
      showSpacer: raw.length > 0,
    });
    i += 1;
  }
  // Bake the position-dependent connector flag into each row's
  // inputs map so the template can hand the same object directly
  // to NgComponentOutlet (no per-render allocation).
  return raw.map((r, idx) => ({
    trackId: r.trackId,
    component: r.component,
    showSpacer: r.showSpacer,
    inputs: {
      ...r.payload,
      showSpacer: r.showSpacer,
      showConnector: idx < raw.length - 1,
    },
  }));
}
