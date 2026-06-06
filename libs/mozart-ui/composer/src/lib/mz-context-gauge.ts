import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmTooltipImports } from '@spartan-ui/tooltip';

const RADIUS = 6.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const AMBER_AT = 0.7;
const RED_AT = 0.9;

/** Clamped fill fraction. `max <= 0` ⇒ 0 (caller hides the gauge anyway). */
export function contextGaugePct(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, used / max));
}

/** Threshold color: neutral < 70%, amber ≥ 70%, red ≥ 90%. */
export function contextGaugeColorClass(pct: number): string {
  if (pct >= RED_AT) return 'text-destructive';
  if (pct >= AMBER_AT) return 'text-amber-500';
  return 'text-muted-foreground';
}

@Component({
  selector: 'mz-context-gauge',
  imports: [HlmTooltipImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center' },
  template: `
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      [class]="_colorClass()"
      [hlmTooltip]="_tooltip()"
      role="img"
      [attr.aria-label]="_tooltip()"
    >
      <circle
        cx="8"
        cy="8"
        [attr.r]="radius"
        fill="none"
        class="text-muted-foreground/25"
        stroke="currentColor"
        stroke-width="2"
      />
      <circle
        cx="8"
        cy="8"
        [attr.r]="radius"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        transform="rotate(-90 8 8)"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="_dashOffset()"
      />
    </svg>
  `,
})
export class MzContextGauge {
  readonly used = input.required<number>();
  readonly max = input.required<number>();

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly _pct = computed(() =>
    contextGaugePct(this.used(), this.max()),
  );

  protected readonly _dashOffset = computed(
    () => CIRCUMFERENCE * (1 - this._pct()),
  );

  protected readonly _colorClass = computed(() =>
    contextGaugeColorClass(this._pct()),
  );

  protected readonly _tooltip = computed(
    () =>
      `Context window: ${fmt(this.used())} / ${fmt(this.max())} (${Math.round(this._pct() * 100)}%)`,
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}
