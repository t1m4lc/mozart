import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { Message } from '@mozart/desktop-chat-util';
import type {
  TimelineDensity,
  TurnFileChipEvent,
} from '@mozart-ui/timeline';
import { AgentMessage } from './ui-agent-message';
import { SetupProgressMessage } from './ui-setup-progress-message';
import { SystemInfoMessage } from './ui-system-info-message';
import { UserMessage } from './ui-user-message';

// Pure presentational @for over messages, switching on role. Owns no
// scroll behavior — chat scroll is orchestrated from
// FeatureChatScrollSurface against the shell's <main> overflow surface,
// using ScrollPositionService for per-tab persistence and attach mode.
//
// Reserved-room spacer (50vh) appears after the last message while
// a turn is in flight (user just submitted OR assistant is streaming
// /pending). The scroll surface's auto-follow points scrollTop at
// scrollHeight every animation frame ; without the spacer the
// in-flight prose lands hard against the composer overlay and each
// new token visibly nudges the viewport. With the spacer, scrollTop
// sits 50vh past the prose so the latest tokens render around
// viewport-center with breathing room below — perceived as a single
// smooth fill instead of a per-token jerk.
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
            <app-agent-message
              [message]="msg"
              [density]="density()"
              (fileChipClick)="fileChipClick.emit($event)"
            />
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
    @if (_showInFlightSpacer()) {
      <div aria-hidden="true" class="h-[50vh] shrink-0"></div>
    }
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
  readonly density = input<TimelineDensity>('normal');

  readonly fileChipClick = output<TurnFileChipEvent>();

  // Active when the last message is a freshly-sent user prompt (about
  // to spawn an assistant turn) or an assistant message still
  // streaming. Triggers the in-flight breathing-room spacer below the
  // last row.
  protected readonly _showInFlightSpacer = computed(() => {
    const list = this.messages();
    const last = list[list.length - 1];
    if (!last) return false;
    if (last.role === 'user') return true;
    if (last.role === 'assistant') {
      return last.status === 'streaming' || last.status === 'pending';
    }
    return false;
  });
}
