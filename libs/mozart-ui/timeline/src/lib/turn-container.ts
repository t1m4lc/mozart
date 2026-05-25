import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { anyVisibleAt } from './_density.util';
import { DoneMarker } from './done-marker';
import { ErrorMarker } from './error-marker';
import { FileChipBus } from './file-chip-bus';
import { MessageBody } from './message-body';
import { Timeline } from './timeline';
import { TurnBody } from './turn-body';
import { TurnHeader } from './turn-header';
import type {
  TimelineDensity,
  TurnFileChipEvent,
  TurnState,
} from './turn-state.types';

// Phase 3b — public agent-turn container. Consumed by the chat
// domain's AgentMessage smart wrapper. Owns the header (shimmer
// summary + chevron), the collapsible body (streamed prose +
// vertical timeline of items + done/error markers), and routes
// file-chip clicks from dynamically-mounted renderers up to the host
// via a per-turn FileChipBus.
//
// The collapsed state is local UI state — never derived from stream
// events. The host can two-way-bind it via `[(collapsed)]` if it
// wants to persist the choice across re-mounts.

@Component({
  selector: 'mz-turn-container',
  imports: [TurnHeader, TurnBody, MessageBody, Timeline, DoneMarker, ErrorMarker],
  providers: [FileChipBus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <mz-turn-header
      [summary]="state().summary"
      [streaming]="state().isStreaming"
      [(collapsed)]="collapsed"
    />
    @if (_hasBody()) {
      <mz-turn-body [collapsed]="collapsed()">
        @if (_hasItems()) {
          <mz-timeline [items]="state().items" [density]="density()" />
        }
        @if (_showDone()) {
          <mz-done-marker [class.mt-1]="_hasItems()" />
        } @else if (_showError()) {
          <mz-error-marker
            [class.mt-1]="_hasItems()"
            [label]="_errorLabel()"
          />
        }
      </mz-turn-body>
    }
    @if (_hasText()) {
      <mz-message-body
        class="mt-2"
        [text]="state().text"
        [streaming]="state().isStreaming"
      />
    }
  `,
})
export class TurnContainer {
  readonly state = input.required<TurnState>();
  readonly collapsed = model<boolean>(false);
  // Forwarded to <mz-timeline>. AgentMessage reads it from
  // TimelinePrefsService and binds it here.
  readonly density = input<TimelineDensity>('normal');

  readonly fileChipClick = output<TurnFileChipEvent>();

  protected readonly _hasText = computed(() => this.state().text.length > 0);
  // True only when at least one item would actually render at the
  // current density. Using the unfiltered count here would mount an
  // empty <mz-timeline> in `compact` mode and add a stray top margin
  // around the markers.
  protected readonly _hasItems = computed(() =>
    anyVisibleAt(this.state().items, this.density()),
  );

  // True when the collapsible <mz-turn-body> has anything to show
  // (timeline rows OR a terminal marker). When false we skip mounting
  // the body entirely so the assistant prose sits directly under the
  // header. The assistant prose itself lives OUTSIDE the body so it
  // stays visible after the user collapses the technical detail.
  protected readonly _hasBody = computed(
    () => this._hasItems() || this._showDone() || this._showError(),
  );

  protected readonly _showDone = computed(
    () => this.state().showDoneMarker && this.state().outcome === 'done',
  );

  protected readonly _showError = computed(() => {
    const o = this.state().outcome;
    return o === 'error' || o === 'stopped';
  });

  protected readonly _errorLabel = computed(() =>
    this.state().outcome === 'stopped' ? 'Stopped' : 'Error',
  );

  constructor() {
    inject(FileChipBus)
      .clicked.pipe(takeUntilDestroyed())
      .subscribe((path) => this.fileChipClick.emit({ path }));
  }
}
