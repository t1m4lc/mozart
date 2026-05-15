import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  type Type,
} from '@angular/core';
import { DoneMarker } from './done-marker';
import { ErrorMarker } from './error-marker';
import { TOOL_RENDERERS } from './renderers/tool-renderers.registry';
import type { TurnItem, TurnOutcome } from './turn-state.types';

// Phase 3b — vertical timeline of agent activity. Renders each item
// via the renderer registry (kind → component, dispatched through
// NgComponentOutlet) and appends a Done/Error marker when the turn
// has a terminal outcome. Items are append-only and keyed by `id`
// (spec §9.1 — re-rendering must produce identical output).

interface TimelineRow {
  readonly item: TurnItem;
  readonly component: Type<unknown>;
  readonly showSpacer: boolean;
  readonly showConnector: boolean;
}

@Component({
  selector: 'hlm-timeline',
  imports: [NgComponentOutlet, DoneMarker, ErrorMarker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col' },
  template: `
    @for (row of _rows(); track row.item.id) {
      <ng-container
        *ngComponentOutlet="
          row.component;
          inputs: {
            item: row.item,
            showSpacer: row.showSpacer,
            showConnector: row.showConnector
          }
        "
      />
    }
    @if (_showDone()) {
      <hlm-done-marker />
    } @else if (_showError()) {
      <hlm-error-marker [label]="_errorLabel()" />
    }
  `,
})
export class Timeline {
  readonly items = input.required<readonly TurnItem[]>();
  readonly outcome = input<TurnOutcome | undefined>(undefined);
  readonly showDoneMarker = input<boolean>(false);

  protected readonly _rows = computed<readonly TimelineRow[]>(() => {
    const items = this.items();
    return items.map((item, index) => ({
      item,
      component: TOOL_RENDERERS[item.kind] ?? TOOL_RENDERERS.generic,
      // First row joins the message body above without a spacer; the
      // rest get the 8px connector spacer (per spec §A.3 / §A.7.4).
      showSpacer: index > 0,
      // Every item connects down to the next row OR to a terminal
      // marker. Only the marker itself omits the connector.
      showConnector: true,
    }));
  });

  protected readonly _showDone = computed(
    () => this.showDoneMarker() && this.outcome() === 'done',
  );

  protected readonly _showError = computed(() => {
    const o = this.outcome();
    return o === 'error' || o === 'stopped';
  });

  protected readonly _errorLabel = computed(() =>
    this.outcome() === 'stopped' ? 'Stopped' : 'Error',
  );
}
