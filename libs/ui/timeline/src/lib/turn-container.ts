import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
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
// summary + chevron) and the collapsible body (which currently hosts
// the existing MessageBody for streamed prose). Future atoms add the
// vertical timeline + done/error markers inside the body.
//
// The collapsed state is local UI state — never derived from stream
// events. The host can two-way-bind it via `[(collapsed)]` if it
// wants to persist the choice across re-mounts.

@Component({
  selector: 'hlm-turn-container',
  imports: [TurnHeader, TurnBody, MessageBody, Timeline],
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

  // Reserved for Atom 4 (file chip click → host routes to diff aside
  // or copies path). Defined here so the public surface is stable
  // before the wiring lands.
  readonly fileChipClick = output<TurnFileChipEvent>();

  protected readonly _hasText = computed(() => this.state().text.length > 0);
  protected readonly _hasTimeline = computed(() => {
    const s = this.state();
    return s.items.length > 0 || !!s.outcome;
  });
}
