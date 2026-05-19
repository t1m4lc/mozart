import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { auditTime } from 'rxjs/operators';
import type { Message } from '../../data/message.model';
import { AgentMessage } from '../agent-message/agent-message';
import { SetupProgressMessage } from '../setup-progress-message/setup-progress-message';
import { SystemInfoMessage } from '../system-info-message/system-info-message';
import { UserMessage } from '../user-message/user-message';

// Plain scrolling message list. CDK virtual scroll was removed because
// the fixed-size strategy mis-measured variable-height messages and
// the scrollbar drifted on long chats (perf-backlog ref 37f6171).
//
// TODO(perf): reintroduce virtualization once we have a real autosize
//   strategy (or build a custom one). Acceptable for now — typical
//   chats stay under a few hundred messages, well below the DOM
//   threshold where this becomes a bottleneck.
//
// `feature-chat-panel` drives auto-follow via `isAtBottom()` +
// `scrollToBottom()`.
const AT_BOTTOM_THRESHOLD_PX = 50;
const SCROLL_AUDIT_MS = 220;

@Component({
  selector: 'app-message-list',
  imports: [UserMessage, AgentMessage, SystemInfoMessage, SetupProgressMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <div #viewport class="h-full w-full overflow-y-auto">
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
    </div>
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport =
    viewChild.required<ElementRef<HTMLDivElement>>('viewport');

  private readonly _isAtBottom = signal(true);
  readonly isAtBottom = this._isAtBottom.asReadonly();

  constructor() {
    afterNextRender(() => {
      const el = this.viewport().nativeElement;
      fromEvent(el, 'scroll')
        .pipe(auditTime(SCROLL_AUDIT_MS), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
          this._isAtBottom.set(distanceFromBottom < AT_BOTTOM_THRESHOLD_PX);
        });
    });

    // New message + already at bottom → keep pinned.
    effect(() => {
      this.messages();
      if (this._isAtBottom()) {
        queueMicrotask(() => this.scrollToBottom(false));
      }
    });
  }

  scrollToBottom(smooth = true): void {
    const el = this.viewport().nativeElement;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduced || !smooth ? 'auto' : 'smooth',
    });
    this._isAtBottom.set(true);
  }
}
