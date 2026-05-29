import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import type { Message } from '@mozart/desktop-chat-util';

// Collapsed height cap for long prompts (px). Matches `max-h-60`
// (15rem). Past this the bubble clamps with a fade + Show more / less
// toggle so one giant paste can't dominate the chat — ChatGPT-style.
const COLLAPSED_MAX_PX = 240;

@Component({
  selector: 'app-user-message',
  imports: [HlmSpinnerImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex justify-end">
      <div class="flex max-w-[80%] flex-col items-end gap-1">
        <div
          class="relative w-full select-text whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm text-foreground transition-colors"
          [class.italic]="_isQueued() || _isStopped()"
          [class.opacity-70]="_isQueued()"
          [class.opacity-50]="_isStopped()"
          [class.line-through]="_isStopped()"
        >
          <div #content [class]="_contentClass()">
            @if (_isQueued()) {
              <hlm-spinner
                aria-label="Waiting for current turn to finish"
                class="mr-2 inline-block shrink-0 align-[-2px] text-muted-foreground"
              />
            }
            <span>{{ message().content }}</span>
          </div>
          @if (_collapsed()) {
            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-lg bg-gradient-to-t from-muted to-transparent"
            ></div>
          }
        </div>
        @if (_overflows()) {
          <button
            type="button"
            class="px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            (click)="_expanded.set(!_expanded())"
          >
            {{ _expanded() ? 'Show less' : 'Show more' }}
          </button>
        }
      </div>
    </div>
  `,
})
export class UserMessage {
  readonly message = input.required<Message>();

  private readonly contentEl =
    viewChild<ElementRef<HTMLDivElement>>('content');
  protected readonly _expanded = signal(false);
  protected readonly _overflows = signal(false);
  protected readonly _collapsed = computed(
    () => this._overflows() && !this._expanded(),
  );
  // Collapsed: clamp + clip (fade overlay sits on top). Expanded: a
  // taller cap with its own scroll so a huge prompt stays readable
  // without pushing the composer off-screen. Empty when the content
  // fits — no clamp needed.
  protected readonly _contentClass = computed<string>(() => {
    if (this._expanded()) return 'max-h-[32rem] overflow-y-auto';
    if (this._overflows()) return 'max-h-60 overflow-hidden';
    return '';
  });

  protected readonly _isQueued = computed(
    () => this.message().status === 'queued',
  );
  protected readonly _isStopped = computed(
    () => this.message().status === 'stopped',
  );

  private _resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const el = this.contentEl()?.nativeElement;
      if (!el) return;
      this._measure();
      // Re-measure on width reflow (sidebar toggle, window resize) —
      // wrapping changes the content height and thus whether it
      // overflows. `scrollHeight` ignores our max-height clamp, so this
      // can't feed back into a layout loop.
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => this._measure());
        this._resizeObserver.observe(el);
      }
    });
    inject(DestroyRef).onDestroy(() => this._resizeObserver?.disconnect());
  }

  private _measure(): void {
    const el = this.contentEl()?.nativeElement;
    if (!el) return;
    const overflows = el.scrollHeight > COLLAPSED_MAX_PX;
    if (overflows !== this._overflows()) this._overflows.set(overflows);
  }
}
