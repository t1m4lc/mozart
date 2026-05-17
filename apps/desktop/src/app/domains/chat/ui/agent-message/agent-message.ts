import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MessageBody, TurnContainer } from '@mozart-ui/timeline';
import type { TurnFileChipEvent } from '@mozart-ui/timeline';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmLoaderImports } from '@mozart/ui/loader';
import type { Message } from '../../data/message.model';

@Component({
  selector: 'app-agent-message',
  imports: [MessageBody, TurnContainer, ...HlmLoaderImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="flex w-full flex-col gap-2">
      @if (message().turnState; as ts) {
        <mz-turn-container
          [state]="ts"
          (fileChipClick)="onFileChipClick($event)"
        />
      } @else if (_isLoading()) {
        <hlm-loader size="sm" class="text-brand" />
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

  protected readonly _isStreaming = computed(
    () => this.message().status === 'streaming',
  );

  protected readonly _isLoading = computed(() => {
    const msg = this.message();
    if (msg.status === 'pending' || msg.status === 'queued') return true;
    return msg.status === 'streaming' && !msg.content && !msg.turnState;
  });

  // v0.1.0-beta.1 fallback: copy the path to the clipboard. The Phase 4 diff
  // aside lands separately; once it does, this routes there instead.
  protected async onFileChipClick(event: TurnFileChipEvent): Promise<void> {
    try {
      await navigator.clipboard.writeText(event.path);
      toast.success('Path copied', { description: event.path });
    } catch {
      toast.error('Could not copy path');
    }
  }
}
