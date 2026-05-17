import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

// Phase 3a renderer: streams the agent's prose as a clean paragraph.
// While streaming, a subtle pulsing dot sits at the end of the text
// to signal in-flight activity. Phase 3b replaces this with the full
// Claude-style timeline (header + items + done marker).

@Component({
  selector: 'mz-message-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p
      class="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
    >{{ text() }}@if (streaming()) {<span
        class="message-body__cursor"
        aria-hidden="true"
      ></span>}</p>
  `,
  styles: `
    @keyframes message-body-pulse {
      0%, 100% { opacity: 0.3; }
      50%      { opacity: 1; }
    }
    .message-body__cursor {
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-left: 4px;
      vertical-align: baseline;
      border-radius: 9999px;
      background: currentColor;
      animation: message-body-pulse 1.2s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .message-body__cursor {
        animation: none;
        opacity: 0.6;
      }
    }
  `,
})
export class MessageBody {
  readonly text = input<string>('');
  readonly streaming = input<boolean>(false);

  // computed isn't load-bearing here but keeps the template tidy if
  // we later derive trimmed/truncated views.
  protected readonly _hasText = computed(() => this.text().length > 0);
}
