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
 * empty-state switch. Projected into `FeatureChatScrollSurface`'s
 * default slot; that surface owns chat scroll behavior. The composer
 * (FeatureWorkspaceComposer) lives outside both, always mounted at
 * WorkspaceTabContent's bottom regardless of which content sits in
 * the chat surface — that's the P2.2 file-tab visibility design.
 *
 * Owns no scroll API. FeatureChatScrollSurface drives chat scroll
 * against the shell's `<main>` overflow surface, using
 * ScrollPositionService for per-tab persistence and per-chat
 * attach/detach mode.
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
