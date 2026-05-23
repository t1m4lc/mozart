import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { MessageList } from '@mozart/desktop-chat-ui';

/**
 * Chat-only content for the middle shell — owns the message-list /
 * empty-state switch. Projected into `FeatureWorkspaceMiddle`'s
 * `[middle-content]` slot ; the surrounding frame keeps the composer
 * pinned regardless of which content sits inside.
 *
 * Owns no scroll API. FeatureWorkspaceMiddle drives chat scroll against
 * the shell's `<main>` overflow surface, using ScrollPositionService
 * for per-tab persistence and per-chat attach/detach mode.
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
      <app-message-list [messages]="messages()" />
    } @else {
      <ng-content />
    }
  `,
})
export class FeatureChatContent {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);

  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );
}
