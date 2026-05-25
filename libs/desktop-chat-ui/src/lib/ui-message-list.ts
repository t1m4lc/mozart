import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { Message } from '@mozart/desktop-chat-util';
import { AgentMessage } from './ui-agent-message';
import { SetupProgressMessage } from './ui-setup-progress-message';
import { SystemInfoMessage } from './ui-system-info-message';
import { UserMessage } from './ui-user-message';

interface ChatTurn {
  readonly id: string;
  readonly messages: readonly Message[];
}

// Group consecutive messages into "turns": a turn starts at each user
// message and includes every assistant/system message that follows
// until the next user message. Leading non-user messages (system info
// before the first user prompt) form an initial turn. Identity is the
// first message's id — stable across appends so @for tracking doesn't
// re-render existing turns when a new message extends the latest one.
function groupTurns(messages: readonly Message[]): readonly ChatTurn[] {
  const out: ChatTurn[] = [];
  let current: Message[] = [];
  for (const msg of messages) {
    if (msg.role === 'user' && current.length > 0) {
      out.push({ id: current[0].id, messages: current });
      current = [];
    }
    current.push(msg);
  }
  if (current.length > 0) {
    out.push({ id: current[0].id, messages: current });
  }
  return out;
}

// Pure presentational @for over turn groups, switching on role within
// each turn. Owns no scroll behavior — chat scroll is orchestrated
// from FeatureChatScrollSurface via [mzScrollSurface], with the
// trailing [data-scroll-sentinel] below as the IntersectionObserver
// target for at-bottom detection.
//
// `.chat-turn:last-of-type { min-height: 100cqh; }` reserves
// viewport-height empty space below the last turn so a newly-sent
// user message can ride up to the top of the visible area on send
// (M15 / ChatGPT rides-up). 100cqh resolves against the chat scroll
// surface's container-type:size context. When the assistant response
// is short the empty space lingers (consistent feel); when it's tall
// the rule is a no-op because content already exceeds min-height.
//
// TODO(perf): see TODOS.md — virtual scrolling is captured there.
// Future virtual-scroll path: `content-visibility: auto` per
// .chat-turn (Chromium-native), NOT CDK Virtual Scroll (which was
// reverted once because variable-height streaming content broke both
// FixedSize and experimental AutoSize strategies).
@Component({
  selector: 'app-message-list',
  imports: [UserMessage, AgentMessage, SystemInfoMessage, SetupProgressMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  styles: [
    `
      .chat-turn:last-of-type {
        min-height: 100cqh;
      }
    `,
  ],
  template: `
    @for (turn of turns(); track turn.id) {
      <div class="chat-turn flex flex-col">
        @for (msg of turn.messages; track msg.id) {
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

  protected readonly turns = computed(() => groupTurns(this.messages()));
}
