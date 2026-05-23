import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import type { Message } from '@mozart/desktop-chat-util';

@Component({
  selector: 'app-user-message',
  imports: [HlmSpinnerImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex justify-end">
      <div
        class="inline-flex max-w-[80%] select-text items-center gap-2 whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors"
        [class.italic]="_isQueued() || _isStopped()"
        [class.opacity-70]="_isQueued()"
        [class.opacity-50]="_isStopped()"
        [class.line-through]="_isStopped()"
      >
        @if (_isQueued()) {
          <hlm-spinner
            aria-label="Waiting for current turn to finish"
            class="shrink-0 text-muted-foreground"
          />
        }
        <span>{{ message().content }}</span>
      </div>
    </div>
  `,
})
export class UserMessage {
  readonly message = input.required<Message>();
  protected readonly _isQueued = computed(
    () => this.message().status === 'queued',
  );
  protected readonly _isStopped = computed(
    () => this.message().status === 'stopped',
  );
  // protected readonly _isDone = computed(() => this.message().status === 'done');
}
