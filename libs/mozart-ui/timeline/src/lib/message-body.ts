import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, animationFrames, distinctUntilChanged, scan, switchMap } from 'rxjs';
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
//
// Typing animation : Claude CLI batches text deltas (sometimes the
// entire reply lands in one chunk), which feels like the prose
// "pops" into existence. We smooth that out with a per-frame
// type-on reveal — the displayed prefix length advances toward
// `text().length` at TYPE_CHARS_PER_FRAME chars per animation
// frame while `streaming` is true. RxJS chain :
//   streaming → Observable → switchMap to `animationFrames()` while
//   active, `EMPTY` when not → scan accumulates the displayed
//   length, capping at the current `text().length` → toSignal.
// No effect, no setInterval. switchMap drops the inner stream on
// streaming=false (the `_displayedText` computed below snaps to the
// full text in that case). distinctUntilChanged keeps the signal
// from emitting when no new char was revealed this frame.

// Chars revealed per animation frame at 60Hz → ~120 chars/sec. Tuned
// so a typical 200-char reply takes ~1.6s to fully render — feels
// like fast typing without dragging on long responses.
const TYPE_CHARS_PER_FRAME = 2;

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

  // Type-on cursor — advances each animation frame toward
  // `text().length` while `streaming` is true. Capped by the live
  // text length so it never outruns what's actually been received.
  private readonly _displayedLength = toSignal(
    toObservable(this.streaming).pipe(
      switchMap((streaming) =>
        streaming
          ? animationFrames().pipe(
              scan((acc) => {
                const target = this.text().length;
                if (acc >= target) return acc;
                return Math.min(target, acc + TYPE_CHARS_PER_FRAME);
              }, 0),
              distinctUntilChanged(),
            )
          : EMPTY,
      ),
    ),
    { initialValue: 0 },
  );

  // Visible prefix of `text()`. While streaming, slice to the
  // animated length ; once streaming ends, snap to the full text so
  // the user doesn't have to wait through the rest of the reveal.
  protected readonly _displayedText = computed(() => {
    const raw = this.text();
    if (!this.streaming()) return raw;
    return raw.slice(0, this._displayedLength());
  });

  protected readonly _html = computed<string>(() => {
    const visible = this._displayedText();
    return visible ? (marked.parse(visible, { async: false }) as string) : '';
  });
}
