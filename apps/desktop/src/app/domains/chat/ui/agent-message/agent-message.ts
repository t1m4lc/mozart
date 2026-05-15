import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MessageBody, TurnContainer } from '@mozart/ui/timeline';
import type { TurnFileChipEvent } from '@mozart/ui/timeline';
import { toast } from '@spartan-ng/brain/sonner';
import type { Message } from '../../data/message.model';

@Component({
  selector: 'app-agent-message',
  imports: [MessageBody, TurnContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="flex max-w-[85%] flex-col gap-2">
      @if (message().turnState; as ts) {
        <hlm-turn-container
          [state]="ts"
          (fileChipClick)="onFileChipClick($event)"
        />
      } @else {
        <hlm-message-body
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

  // v0.0.1 fallback: copy the path to the clipboard. The Phase 4 diff
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
