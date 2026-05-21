import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Message } from '../../data/message.model';
import { AgentMessage } from '../agent-message/agent-message';
import { SetupProgressMessage } from '../setup-progress-message/setup-progress-message';
import { SystemInfoMessage } from '../system-info-message/system-info-message';
import { UserMessage } from '../user-message/user-message';

// Pure presentational @for over messages, switching on role. Owns no
// scroll behavior — chat scroll is orchestrated from
// FeatureWorkspaceMiddle against the shell's <main> overflow surface,
// using ScrollPositionService for per-tab persistence and attach mode.
//
// TODO(perf): see TODOS.md — virtual scrolling is captured there.
@Component({
  selector: 'app-message-list',
  imports: [UserMessage, AgentMessage, SystemInfoMessage, SetupProgressMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @for (msg of messages(); track msg.id) {
      <div class="px-4 py-1.5">
        @switch (msg.role) {
          @case ('user') {
            <app-user-message [message]="msg" />
          }
          @case ('assistant') {
            <app-agent-message [message]="msg" />
          }
          @case ('system') {
            @if (msg.setupProgress) {
              <app-setup-progress-message [message]="msg" />
            } @else if (msg.systemInfo) {
              <app-system-info-message [message]="msg" />
            }
          }
        }
      </div>
    }
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
}
