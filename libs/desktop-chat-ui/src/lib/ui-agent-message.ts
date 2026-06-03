import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MessageBody, TurnContainer } from '@mozart-ui/timeline';
import type {
  TimelineDensity,
  TurnFileChipEvent,
} from '@mozart-ui/timeline';
import { MzDotLoader } from '@mozart-ui/loader';
import type { Message } from '@mozart/desktop-chat-util';

@Component({
  selector: 'app-agent-message',
  imports: [MessageBody, TurnContainer, MzDotLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="flex w-full flex-col gap-2">
      @if (message().turnState; as ts) {
        <mz-turn-container
          [state]="ts"
          [density]="density()"
          (fileChipClick)="fileChipClick.emit($event)"
        />
      } @else if (_isLoading()) {
        <mz-dot-loader />
      } @else {
        <mz-message-body
          [text]="message().content"
          [streaming]="_isStreaming()"
        />
      }
    </article>
  `,
})
export class AgentMessage {
  readonly message = input.required<Message>();
  // Density forwarded by `MessageList` from `FeatureChatContent`,
  // which reads it off `TimelinePrefsService`. UI lib stays pure —
  // no data-access import needed here.
  readonly density = input<TimelineDensity>('normal');

  // Emitted when the user clicks a file chip in the timeline. The
  // feature wrapper resolves it against `WorkspacesFacade` +
  // `FileTabsService` to navigate to the Files tab in diff mode.
  readonly fileChipClick = output<TurnFileChipEvent>();

  protected readonly _isStreaming = computed(
    () => this.message().status === 'streaming',
  );

  protected readonly _isLoading = computed(() => {
    const msg = this.message();
    if (msg.status === 'pending' || msg.status === 'queued') return true;
    return msg.status === 'streaming' && !msg.content && !msg.turnState;
  });
}
