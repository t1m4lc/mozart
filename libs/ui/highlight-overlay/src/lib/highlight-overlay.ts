import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import type {
  HighlightGeometry,
  HighlightSide,
  HighlightStep,
} from './highlight-overlay.types';

const HOLE_PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_FALLBACK_HEIGHT = 160;

// Guided-tour overlay primitive. Renders a full-screen SVG with a
// punch-hole over the target element + a tooltip card next to it.
// `currentIndex` is consumer-driven ; the primitive emits `(advance)` /
// `(skip)` / `(complete)` (when the last-step "Finish" button is clicked)
// and blocks all click-through so the user can't interact with the
// underlying UI mid-tour.
//
// Pure presentational : zero `@mozart/*` domain imports beyond
// `@mozart/ui/button` (a sibling primitive). Tracks the target via
// `getBoundingClientRect()` + a ResizeObserver so the hole follows
// layout changes.
@Component({
  selector: 'hlm-highlight-overlay',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'fixed inset-0 z-50 flex select-none items-stretch justify-stretch',
    role: 'dialog',
    'aria-modal': 'true',
  },
  template: `
    @if (_geometry(); as g) {
      <svg
        class="pointer-events-auto absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <mask id="hlm-highlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              [attr.x]="g.x"
              [attr.y]="g.y"
              [attr.width]="g.width"
              [attr.height]="g.height"
              rx="6"
              ry="6"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          class="fill-black/60"
          mask="url(#hlm-highlight-mask)"
        ></rect>
      </svg>

      <div
        #tooltip
        class="pointer-events-auto absolute w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-lg"
        [style.left.px]="_tooltipLeft()"
        [style.top.px]="_tooltipTop()"
      >
        <h3 class="text-sm font-semibold">{{ _step()?.title }}</h3>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ _step()?.description }}
        </p>
        <div class="mt-4 flex items-center justify-between gap-2">
          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            (click)="_onSkip()"
          >
            Skip
          </button>
          <span class="text-xs text-muted-foreground">
            {{ _progressLabel() }}
          </span>
          <button hlmBtn size="sm" type="button" (click)="_onNext()">
            {{ _isLast() ? 'Finish' : 'Next' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class HlmHighlightOverlay {
  readonly steps = input.required<readonly HighlightStep[]>();
  readonly currentIndex = input<number>(0);

  readonly advance = output<void>();
  readonly skip = output<void>();
  readonly complete = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly tooltipRef =
    viewChild<ElementRef<HTMLDivElement>>('tooltip');

  protected readonly _step = computed(
    () => this.steps()[this.currentIndex()] ?? null,
  );
  protected readonly _isLast = computed(
    () => this.currentIndex() === this.steps().length - 1,
  );
  protected readonly _progressLabel = computed(
    () => `${this.currentIndex() + 1} / ${this.steps().length}`,
  );

  protected readonly _geometry = signal<HighlightGeometry | null>(null);
  protected readonly _tooltipLeft = signal<number>(0);
  protected readonly _tooltipTop = signal<number>(0);

  private targetEl: Element | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafHandle: number | null = null;

  constructor() {
    effect(() => {
      const s = this._step();
      if (!s) {
        this._geometry.set(null);
        return;
      }
      this.observeTarget(s);
    });
    this.destroyRef.onDestroy(() => this.disconnect());
  }

  @HostListener('window:resize')
  protected _onWindowResize(): void {
    this.scheduleMeasure();
  }

  @HostListener('window:scroll')
  protected _onWindowScroll(): void {
    this.scheduleMeasure();
  }

  @HostListener('document:keydown.escape', ['$event'])
  protected _onEscape(event: Event): void {
    event.preventDefault();
    this._onSkip();
  }

  protected _onNext(): void {
    if (this._isLast()) {
      this.complete.emit();
      return;
    }
    this.advance.emit();
  }

  protected _onSkip(): void {
    this.skip.emit();
  }

  private observeTarget(step: HighlightStep): void {
    this.disconnectObserver();
    const el = document.querySelector(step.targetSelector);
    this.targetEl = el;
    if (!el) {
      // Selector didn't resolve — fall back to a centered fake rect so
      // the tooltip is still visible and the user can advance / skip.
      this._geometry.set({
        x: window.innerWidth / 2 - 60,
        y: window.innerHeight / 2 - 30,
        width: 120,
        height: 60,
        side: 'bottom',
      });
      this.positionTooltip();
      return;
    }
    this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
    this.resizeObserver.observe(el);
    this.scheduleMeasure();
  }

  private scheduleMeasure(): void {
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.measure();
    });
  }

  private measure(): void {
    if (!this.targetEl) return;
    const rect = this.targetEl.getBoundingClientRect();
    const padded = {
      x: Math.max(0, rect.left - HOLE_PADDING),
      y: Math.max(0, rect.top - HOLE_PADDING),
      width: rect.width + HOLE_PADDING * 2,
      height: rect.height + HOLE_PADDING * 2,
    };
    const side = this.resolveSide(padded);
    this._geometry.set({ ...padded, side });
    this.positionTooltip();
  }

  private resolveSide(
    rect: { x: number; y: number; width: number; height: number },
  ): Exclude<HighlightSide, 'auto'> {
    const preferred = this._step()?.position ?? 'bottom';
    if (preferred !== 'auto') return preferred;
    const spaces: Record<Exclude<HighlightSide, 'auto'>, number> = {
      top: rect.y,
      bottom: window.innerHeight - (rect.y + rect.height),
      left: rect.x,
      right: window.innerWidth - (rect.x + rect.width),
    };
    return (Object.entries(spaces) as Array<
      [Exclude<HighlightSide, 'auto'>, number]
    >).sort((a, b) => b[1] - a[1])[0][0];
  }

  private positionTooltip(): void {
    const g = this._geometry();
    if (!g) return;
    const tooltipEl = this.tooltipRef()?.nativeElement;
    const tooltipHeight = tooltipEl?.offsetHeight ?? TOOLTIP_FALLBACK_HEIGHT;
    let left = g.x;
    let top = g.y;
    switch (g.side) {
      case 'bottom':
        top = g.y + g.height + TOOLTIP_GAP;
        left = g.x + g.width / 2 - TOOLTIP_WIDTH / 2;
        break;
      case 'top':
        top = g.y - tooltipHeight - TOOLTIP_GAP;
        left = g.x + g.width / 2 - TOOLTIP_WIDTH / 2;
        break;
      case 'right':
        left = g.x + g.width + TOOLTIP_GAP;
        top = g.y + g.height / 2 - tooltipHeight / 2;
        break;
      case 'left':
        left = g.x - TOOLTIP_WIDTH - TOOLTIP_GAP;
        top = g.y + g.height / 2 - tooltipHeight / 2;
        break;
    }
    const margin = 8;
    left = Math.min(
      Math.max(margin, left),
      window.innerWidth - TOOLTIP_WIDTH - margin,
    );
    top = Math.min(
      Math.max(margin, top),
      window.innerHeight - tooltipHeight - margin,
    );
    this._tooltipLeft.set(Math.round(left));
    this._tooltipTop.set(Math.round(top));
  }

  private disconnectObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.rafHandle != null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private disconnect(): void {
    this.disconnectObserver();
    this.targetEl = null;
  }
}
