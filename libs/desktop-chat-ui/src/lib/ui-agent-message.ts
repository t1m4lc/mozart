import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MessageBody, TurnContainer } from '@mozart-ui/timeline';
import type { TimelineDensity, TurnFileChipEvent } from '@mozart-ui/timeline';
import { MzDotLoader } from '@mozart-ui/loader';
import type { Message } from '@mozart/desktop-chat-util';

@Component({
  selector: 'app-agent-message',
  imports: [MessageBody, TurnContainer, MzDotLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="group/agent flex w-full flex-col gap-2">
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
      @if (_canDebug()) {
        <button
          type="button"
          class="self-start rounded px-1 font-mono text-[10px] text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/agent:opacity-100"
          (click)="debugRequested.emit(message().runId!)"
        >
          {{ '{}' }} debug
        </button>
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

  // Dev-only: gates the envelope-inspector affordance. Set by the feature
  // wrapper from `isDevDebugViewEnabled()` — UI lib stays pure.
  readonly debugEnabled = input<boolean>(false);
  // Emits this turn's run id when the debug affordance is clicked.
  readonly debugRequested = output<string>();

  protected readonly _canDebug = computed(
    () => this.debugEnabled() && !!this.message().runId,
  );

  protected readonly _isStreaming = computed(
    () => this.message().status === 'streaming',
  );

  protected readonly _isLoading = computed(() => {
    const msg = this.message();
    if (msg.status === 'pending' || msg.status === 'queued') return true;
    return msg.status === 'streaming' && !msg.content && !msg.turnState;
  });
}
