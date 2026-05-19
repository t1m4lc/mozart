import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ChatFacade } from '../data/chat.facade';
import { MessageList } from '../ui/message-list/message-list';

/**
 * Chat-only content for the middle shell — owns the message-list /
 * empty-state switch. Projected into `FeatureWorkspaceMiddle`'s
 * `[middle-content]` slot ; the surrounding frame keeps the composer
 * pinned regardless of which content sits inside.
 *
 * Re-exposes the MessageList's `isAtBottom()` + `scrollToBottom()` so
 * the composer (in the frame) can drive auto-follow / send scroll
 * through a `contentChild(FeatureChatContent)` lookup. When the active
 * tab is a file (no FeatureChatContent projected), the composer's
 * auto-follow falls back to its default and `scrollToBottom` no-ops.
 *
 * Empty state is projected via the default `<ng-content>` — keeps the
 * variant/copy decisions in the parent page rather than coupling this
 * component to workspace facades.
 */
@Component({
  selector: 'app-feature-chat-content',
  imports: [MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    @if (messages().length > 0) {
      <app-message-list #list [messages]="messages()" />
    } @else {
      <ng-content />
    }
  `,
})
export class FeatureChatContent {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly list = viewChild(MessageList);

  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );

  readonly isAtBottom = computed(() => this.list()?.isAtBottom() ?? true);

  scrollToBottom(): void {
    this.list()?.scrollToBottom();
  }
}
