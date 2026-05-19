import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { Message } from '../../data/message.model';

/**
 * Subtle muted card that renders a `system_info` chat-timeline entry as
 * stacked conversational paragraphs (no dotted bullet glyph).
 *
 * Stored once at bootstrap time (atom R0.3.E). Read-only — no edit /
 * delete affordance. Renders nothing when the underlying `systemInfo`
 * payload is missing.
 */
@Component({
  selector: 'app-system-info-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let info = _info();
    @if (info && info.lines.length > 0) {
      <div
        role="note"
        aria-label="Project status"
        class="bg-muted/40 border-border/60 text-muted-foreground space-y-2 rounded-md border px-3 py-2 text-sm leading-relaxed"
      >
        @for (line of info.lines; track $index) {
          <p class="text-foreground">{{ line }}</p>
        }
      </div>
    }
  `,
})
export class SystemInfoMessage {
  readonly message = input.required<Message>();
  protected readonly _info = computed(() => this.message().systemInfo);
}
