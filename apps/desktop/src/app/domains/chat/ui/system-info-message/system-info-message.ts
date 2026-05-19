import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { Message } from '../../data/message.model';

/**
 * Subtle muted card that renders a `system_info` chat-timeline entry.
 *
 * Stored once at bootstrap time (atom R0.3.E), this entry surfaces what
 * Mozart detected when the user opened the project — and where the
 * config is stored. Read-only: no edit / delete affordance.
 *
 * If `message.systemInfo` is absent (malformed payload, mis-routed
 * `role: 'system'` row), the component renders nothing so the timeline
 * doesn't show an empty card.
 */
@Component({
  selector: 'app-system-info-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let info = _info();
    @if (info) {
      <div
        role="note"
        aria-label="Project status"
        class="bg-muted/40 border-border/60 text-muted-foreground rounded-md border px-3 py-2 text-sm"
      >
        <div class="flex items-start gap-2">
          <span
            class="text-muted-foreground mt-0.5 select-none"
            aria-hidden="true"
            >ⓘ</span
          >
          <div class="flex-1 space-y-1">
            <p class="text-foreground font-medium">{{ info.title }}</p>
            @if (info.bullets.length > 0) {
              <ul class="space-y-0.5">
                @for (bullet of info.bullets; track bullet) {
                  <li class="flex gap-1.5">
                    <span aria-hidden="true">·</span>
                    <span>{{ bullet }}</span>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SystemInfoMessage {
  readonly message = input.required<Message>();
  protected readonly _info = computed(() => this.message().systemInfo);
}
