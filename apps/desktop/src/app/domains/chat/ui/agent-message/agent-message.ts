import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MessageBody, TurnContainer } from '@mozart/ui/timeline';
import type { Message } from '../../data/message.model';

@Component({
  selector: 'app-agent-message',
  imports: [MessageBody, TurnContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="flex max-w-[85%] flex-col gap-2">
      @if (message().turnState; as ts) {
        <hlm-turn-container [state]="ts" />
      } @else {
        <hlm-message-body
          [text]="message().content"
          [streaming]="_isStreaming()"
        />
      }
    </article>
  `,
})
export class AgentMessage {
  readonly message = input.required<Message>();

  protected readonly _isStreaming = computed(
    () => this.message().status === 'streaming',
  );
}
