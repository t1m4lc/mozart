import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Message } from '../../data/message.model';

@Component({
  selector: 'app-user-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex justify-end">
      <div
        class="max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        {{ message().content }}
      </div>
    </div>
  `,
})
export class UserMessage {
  readonly message = input.required<Message>();
}
