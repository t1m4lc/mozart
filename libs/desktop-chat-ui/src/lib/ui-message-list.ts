import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Message } from '@mozart/desktop-chat-util';
import { AgentMessage } from './ui-agent-message';
import { SetupProgressMessage } from './ui-setup-progress-message';
import { SystemInfoMessage } from './ui-system-info-message';
import { UserMessage } from './ui-user-message';

// Pure presentational @for over messages, switching on role. Owns no
// scroll behavior — chat scroll is orchestrated from
// FeatureChatScrollSurface via [mzScrollSurface], with the trailing
// [data-scroll-sentinel] below as the IntersectionObserver target for
// at-bottom detection.
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
    <!-- Bottom sentinel for MzScrollSurface's IntersectionObserver
         (autoFollow=true). Stays in normal flow at the trailing edge
         of the scroll content so the observer reads natural geometry. -->
    <div data-scroll-sentinel aria-hidden="true" class="h-px w-full"></div>
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
}
