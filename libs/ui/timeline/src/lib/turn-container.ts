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
import { DoneMarker } from './done-marker';
import { ErrorMarker } from './error-marker';
import { FileChipBus } from './file-chip-bus';
import { MessageBody } from './message-body';
import { Timeline } from './timeline';
import { TurnBody } from './turn-body';
import { TurnHeader } from './turn-header';
import type {
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
  selector: 'hlm-turn-container',
  imports: [TurnHeader, TurnBody, MessageBody, Timeline, DoneMarker, ErrorMarker],
  providers: [FileChipBus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <hlm-turn-header
      [summary]="state().summary"
      [streaming]="state().isStreaming"
      [(collapsed)]="collapsed"
    />
    <hlm-turn-body [collapsed]="collapsed()">
      @if (_hasItems()) {
        <hlm-timeline [items]="state().items" />
      }
      @if (_hasText()) {
        <hlm-message-body
          [class.mt-1]="_hasItems()"
          [text]="state().text"
          [streaming]="state().isStreaming"
        />
      }
      @if (_showDone()) {
        <hlm-done-marker class="mt-1" />
      } @else if (_showError()) {
        <hlm-error-marker class="mt-1" [label]="_errorLabel()" />
      }
    </hlm-turn-body>
  `,
})
export class TurnContainer {
  readonly state = input.required<TurnState>();
  readonly collapsed = model<boolean>(false);

  readonly fileChipClick = output<TurnFileChipEvent>();

  protected readonly _hasText = computed(() => this.state().text.length > 0);
  protected readonly _hasItems = computed(() => this.state().items.length > 0);

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
