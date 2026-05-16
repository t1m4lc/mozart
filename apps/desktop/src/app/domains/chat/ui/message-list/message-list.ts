import {
  CdkVirtualScrollViewport,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { auditTime } from 'rxjs/operators';
import type { Message } from '../../data/message.model';
import { AgentMessage } from '../agent-message/agent-message';
import { UserMessage } from '../user-message/user-message';

// Virtual-scrolling message list. The CdkVirtualScrollViewport owns
// the scroll container; only items intersecting (or near) the
// viewport are rendered. Long chats stop choking the DOM.
//
// Items vary in height (user vs assistant, tool-call timelines,
// thinking blocks, …), so we run the fixed-size strategy with a
// generous estimate. The buffer-based prefetch absorbs the variance
// at the cost of rendering ~5-8 extra rows.
//
// `feature-chat-panel` drives auto-follow through this component's
// API : reads `isAtBottom()` to know whether the user is parked at
// the bottom, calls `scrollToBottom()` to re-engage follow.
const ITEM_SIZE_PX = 120;
const MIN_BUFFER_PX = 800;
const MAX_BUFFER_PX = 1200;
const AT_BOTTOM_THRESHOLD_PX = 50;
// 220 ms matches the chat panel's SCROLL_SETTLE_MS legacy value —
// long enough to outlast a smooth scroll, short enough to feel snappy.
const SCROLL_AUDIT_MS = 220;

@Component({
  selector: 'app-message-list',
  imports: [ScrollingModule, UserMessage, AgentMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <cdk-virtual-scroll-viewport
      #viewport
      [itemSize]="itemSize"
      [minBufferPx]="minBuffer"
      [maxBufferPx]="maxBuffer"
      class="block h-full w-full"
    >
      <div *cdkVirtualFor="let msg of messages(); trackBy: trackById"
           class="px-4 py-1.5">
        @switch (msg.role) {
          @case ('user') {
            <app-user-message [message]="msg" />
          }
          @case ('assistant') {
            <app-agent-message [message]="msg" />
          }
        }
      </div>
    </cdk-virtual-scroll-viewport>
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();

  protected readonly itemSize = ITEM_SIZE_PX;
  protected readonly minBuffer = MIN_BUFFER_PX;
  protected readonly maxBuffer = MAX_BUFFER_PX;

  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);

  // Set true whenever the viewport is parked within
  // AT_BOTTOM_THRESHOLD_PX of the bottom edge. The chat panel reads
  // this to decide whether the user has manually scrolled up.
  private readonly _isAtBottom = signal(true);
  readonly isAtBottom = this._isAtBottom.asReadonly();

  constructor() {
    // After the viewport mounts, subscribe to its scroll stream and
    // recompute the "at bottom" flag on each settled tick. auditTime
    // smooths fast wheel deltas without stalling visual updates.
    afterNextRender(() => {
      const vp = this.viewport();
      vp.elementScrolled()
        .pipe(auditTime(SCROLL_AUDIT_MS), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this._isAtBottom.set(
            vp.measureScrollOffset('bottom') < AT_BOTTOM_THRESHOLD_PX,
          );
        });
    });

    // When new messages arrive AND we're already at the bottom, keep
    // the viewport pinned there. The chat panel also calls
    // scrollToBottom() on send (eager follow) ; this handles the
    // background-streaming case where the user hasn't interacted.
    effect(() => {
      this.messages();
      if (this._isAtBottom()) {
        // Schedule after CD so the new item is laid out before we
        // measure / scroll.
        queueMicrotask(() => this.scrollToBottom(false));
      }
    });
  }

  /** Scroll the viewport to the last item. Honors
   *  prefers-reduced-motion automatically. */
  scrollToBottom(smooth = true): void {
    const last = Math.max(0, this.messages().length - 1);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.viewport().scrollToIndex(last, reduced || !smooth ? 'auto' : 'smooth');
    // After a programmatic scroll the audited stream may take a tick;
    // optimistically mark "at bottom" so the next message-arrived
    // effect pins us.
    this._isAtBottom.set(true);
  }

  protected trackById(_idx: number, msg: Message): string {
    return msg.id;
  }
}
