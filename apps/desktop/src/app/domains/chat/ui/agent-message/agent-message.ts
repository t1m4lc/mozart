import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmTimeline } from '@mozart/ui/timeline';
import type { Message } from '../../data/message.model';

@Component({
  selector: 'app-agent-message',
  imports: [HlmTimeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article class="flex max-w-[85%] flex-col gap-2">
      @if (_hasTimelineContent()) {
        <hlm-timeline [turn]="message().timeline!" />
      }
      @if (message().content) {
        <p
          class="whitespace-pre-wrap text-sm text-foreground"
          [class.animate-pulse]="message().status === 'streaming'"
        >{{ message().content }}</p>
      }
    </article>
  `,
})
export class AgentMessage {
  readonly message = input.required<Message>();

  protected readonly _hasTimelineContent = computed(() => {
    const t = this.message().timeline;
    return !!t && (t.items.length > 0 || t.showDoneMarker || !!t.summary);
  });
}
