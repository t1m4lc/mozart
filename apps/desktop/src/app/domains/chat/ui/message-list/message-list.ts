import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Message } from '../../data/message.model';
import { UserMessage } from '../user-message/user-message';

@Component({
  selector: 'app-message-list',
  imports: [UserMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="flex flex-col gap-3 px-4 py-3">
      @for (msg of messages(); track msg.id) {
        <li>
          @switch (msg.role) {
            @case ('user') {
              <app-user-message [message]="msg" />
            }
            @case ('assistant') {
              <!-- Step 5 : ui-agent-message + HlmTimeline -->
            }
          }
        </li>
      }
    </ul>
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
}
