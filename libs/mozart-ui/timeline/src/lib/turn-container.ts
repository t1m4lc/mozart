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
import { TurnFooter } from './turn-footer';
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
  imports: [
    TurnHeader,
    TurnBody,
    TurnFooter,
    MessageBody,
    Timeline,
    DoneMarker,
    ErrorMarker,
  ],
  providers: [FileChipBus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (_hasHeader()) {
      <mz-turn-header
        [summary]="state().summary"
        [streaming]="state().isStreaming"
        [startedAt]="state().startedAt"
        [(collapsed)]="collapsed"
      />
    }
    @if (_hasBody()) {
      <mz-turn-body [collapsed]="collapsed()">
        @if (_hasItems()) {
          <mz-timeline [items]="state().items" [density]="density()" />
        }
        @if (_showDone()) {
          <mz-done-marker class="mt-1" />
        } @else if (_showError()) {
          <mz-error-marker [class.mt-1]="_hasItems()" [label]="_errorLabel()" />
        }
      </mz-turn-body>
    }
    @if (_hasText()) {
      <mz-message-body
        [class.mt-2]="_hasHeader() || _hasBody()"
        [text]="state().text"
        [streaming]="state().isStreaming"
      />
    }
    <mz-turn-footer [state]="state()" />
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

  // Whether the agent did anything technical this turn — items,
  // thinking, errors. Unfiltered (density-independent) on purpose:
  // a tool-heavy turn at compact density still has technical work
  // to attach the header to.
  protected readonly _hasTechnicalWork = computed(
    () => this.state().items.length > 0 || this._showError(),
  );

  // Show the header iff there's something to announce: the agent is
  // working (streaming), there's technical work, or there's an
  // error. Pure text replies that completed cleanly skip the header
  // entirely and render as a plain chat message.
  protected readonly _hasHeader = computed(
    () => this.state().isStreaming || this._hasTechnicalWork(),
  );

  // The collapsible body mounts only when there's something to show
  // at the current density (visible items) or an error to surface.
  // The done marker is the visual cap to the timeline — without
  // items it would be orphan visual noise (the header summary
  // already carries the "Done" signal).
  protected readonly _hasBody = computed(
    () => this._hasItems() || this._showError(),
  );

  protected readonly _showDone = computed(
    () =>
      this.state().showDoneMarker &&
      this.state().outcome === 'done' &&
      this._hasItems(),
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
