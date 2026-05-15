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
  imports: [TurnHeader, TurnBody, MessageBody, Timeline],
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
      @if (_hasText()) {
        <hlm-message-body
          [text]="state().text"
          [streaming]="state().isStreaming"
        />
      }
      @if (_hasTimeline()) {
        <hlm-timeline
          class="mt-1"
          [items]="state().items"
          [outcome]="state().outcome"
          [showDoneMarker]="state().showDoneMarker"
        />
      }
    </hlm-turn-body>
  `,
})
export class TurnContainer {
  readonly state = input.required<TurnState>();
  readonly collapsed = model<boolean>(false);

  readonly fileChipClick = output<TurnFileChipEvent>();

  protected readonly _hasText = computed(() => this.state().text.length > 0);
  protected readonly _hasTimeline = computed(() => {
    const s = this.state();
    return s.items.length > 0 || !!s.outcome;
  });

  constructor() {
    inject(FileChipBus)
      .clicked.pipe(takeUntilDestroyed())
      .subscribe((path) => this.fileChipClick.emit({ path }));
  }
}
