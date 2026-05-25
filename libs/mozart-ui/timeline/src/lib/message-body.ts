import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { marked } from 'marked';

// Streams the agent's prose as markdown-rendered HTML. `marked`
// produces an HTML string that Angular's `[innerHTML]` sanitizer
// strips before injection — same threat model as `MzMessageMarkdown`
// in libs/mozart-ui/message-markdown (the agent has the `Write` tool,
// so its outputs are untrusted by default).
//
// Styling : Tailwind Typography's `prose` (registered globally via
// `@plugin "@tailwindcss/typography"` in each app's styles.css).
// `prose-sm` matches the chat's text-sm baseline ; `dark:prose-invert`
// flips for dark mode ; `max-w-none` opts out of prose's default
// `max-width: 65ch` since the chat container already constrains
// width. The streaming dot lives outside the prose container so
// it isn't styled as inline code or stripped.

@Component({
  selector: 'mz-message-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="prose prose-sm dark:prose-invert max-w-none text-foreground select-text prose-p:my-3 prose-headings:my-3"
      [innerHTML]="_html()"
    ></div>
    @if (streaming()) {
      <span
        aria-hidden="true"
        class="message-body__cursor inline-block align-baseline"
      ></span>
    }
  `,
  styles: `
    @keyframes message-body-pulse {
      0%, 100% { opacity: 0.3; }
      50%      { opacity: 1; }
    }
    .message-body__cursor {
      width: 6px;
      height: 6px;
      margin-left: 4px;
      border-radius: 9999px;
      background: currentColor;
      animation: message-body-pulse 1.2s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .message-body__cursor { animation: none; opacity: 0.6; }
    }
  `,
})
export class MessageBody {
  readonly text = input<string>('');
  readonly streaming = input<boolean>(false);

  protected readonly _html = computed<string>(() => {
    const raw = this.text();
    return raw ? (marked.parse(raw, { async: false }) as string) : '';
  });
}
