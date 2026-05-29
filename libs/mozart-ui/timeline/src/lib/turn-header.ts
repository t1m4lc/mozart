import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MzLoader } from '@mozart-ui/loader';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';
import { EMPTY, map, switchMap, timer } from 'rxjs';
import { SHIMMER_TEXT_STYLES } from './_shimmer.styles';

// Phase 3b — turn header. Renders the agent's status summary with a
// shimmer effect while streaming, and a chevron toggle that collapses
// the body. The summary text is keyed by its content so a status
// rotation (spec §D.2) re-runs the fade-up CSS animation on the inner
// span. The shimmer span itself is the *outer* element and never
// re-mounts (spec §A.7.3) — restarting the shimmer mid-cycle looks
// janky.
//
// Trailing status (after the summary, before the chevron) :
//   - while streaming : compact braille spinner + elapsed `m:ss`
//     counter. Trailing so the elapsed clock reads as a stable
//     right-aligned status while the summary text rotates on the left.
//   - when settled    : nothing. The completed summary text speaks for
//     itself ("Done" / "Error" / "Stopped"). Container hides the
//     header entirely for text-only completed turns.

const FALLBACK_SUMMARY = 'Working…';
const TICK_INTERVAL_MS = 1000;

@Component({
  selector: 'mz-turn-header',
  imports: [HlmIconImports, MzLoader],
  providers: [provideIcons({ lucideChevronDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      (click)="collapsed.set(!collapsed())"
      [attr.aria-expanded]="!collapsed()"
      class="group/turn-header flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left text-muted-foreground transition-colors hover:text-foreground"
    >
      <span class="min-w-0 flex-1 truncate text-sm">
        <span [class.shimmer-text]="streaming()">
          @for (line of [_displayed()]; track line) {
            <span class="summary-line">{{ line }}</span>
          }
        </span>
      </span>
      @if (streaming()) {
        <mz-loader
          variant="simple"
          size="sm"
          class="shrink-0 text-muted-foreground"
        />
        @if (_elapsed(); as e) {
          <span
            class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
            >{{ e }}</span
          >
        }
      }
      <ng-icon
        hlm
        name="lucideChevronDown"
        size="xs"
        class="ml-1 shrink-0 text-muted-foreground/70 opacity-0 transition-transform duration-150 group-hover/turn-header:opacity-100"
        [class.rotate-180]="!collapsed()"
      />
    </button>
  `,
  styles: [
    SHIMMER_TEXT_STYLES,
    `
      @keyframes mz-turn-header-fade-up {
        from {
          opacity: 0;
          transform: translateY(5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .summary-line {
        display: inline-block;
        animation: mz-turn-header-fade-up 350ms ease both;
      }
      @media (prefers-reduced-motion: reduce) {
        .summary-line {
          animation: none;
        }
      }
    `,
  ],
})
export class TurnHeader {
  readonly summary = input<string>('');
  readonly streaming = input<boolean>(false);
  readonly startedAt = input<number>(0);
  readonly collapsed = model<boolean>(false);

  // Live elapsed-time clock, fully declarative. The RxJS chain :
  //   streaming → Observable → switchMap to a `timer(0, 500ms)` when
  //   active, `EMPTY` when not → each tick maps to `Date.now()` →
  //   toSignal converts back.
  // switchMap drops the inner timer subscription the moment streaming
  // flips false ; toSignal registers `takeUntilDestroyed` so the whole
  // chain tears down when the component is destroyed. No effect, no
  // setInterval, no manual cleanup.
  private readonly _now = toSignal(
    toObservable(this.streaming).pipe(
      switchMap((active) =>
        active ? timer(0, TICK_INTERVAL_MS).pipe(map(() => Date.now())) : EMPTY,
      ),
    ),
    { initialValue: Date.now() },
  );

  protected readonly _displayed = computed(
    () => this.summary().trim() || FALLBACK_SUMMARY,
  );

  protected readonly _elapsed = computed(() => {
    if (!this.streaming()) return '';
    const start = this.startedAt();
    if (!start) return '';
    const secTotal = Math.max(0, Math.floor((this._now() - start) / 1000));
    const m = Math.floor(secTotal / 60);
    const s = secTotal % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });
}
