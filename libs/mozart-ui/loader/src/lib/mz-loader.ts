import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

type MzLoaderSize = 'xs' | 'sm' | 'md';
type MzLoaderVariant = 'grid' | 'simple';

const MZ_S: Record<MzLoaderSize, string> = { xs: '3px', sm: '5px', md: '7px' };
const MZ_G: Record<MzLoaderSize, string> = {
  xs: '1.5px',
  sm: '2px',
  md: '3px',
};

// Codex CLI-style single braille spinner — single glyph that reads as
// one compact dot in tight UI (tab strip, menu rows). Sized to match
// nearby text; takes `currentColor`.
const SIMPLE_FONT_SIZE: Record<MzLoaderSize, string> = {
  xs: '10px',
  sm: '12px',
  md: '14px',
};

const BRAILLE_FRAMES = [
  '⠋',
  '⠙',
  '⠹',
  '⠸',
  '⠼',
  '⠴',
  '⠦',
  '⠧',
  '⠇',
  '⠏',
] as const;

@Component({
  selector: 'mz-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center',
    role: 'status',
    'aria-label': 'Loading',
    '[class.mz-loader--grid]': "variant() === 'grid'",
    '[class.mz-loader--simple]': "variant() === 'simple'",
    '[style.--mz-s]': '_s()',
    '[style.--mz-gap]': '_g()',
    '[style.--mz-simple-size]': '_simpleSize()',
  },
  template: `
    @if (variant() === 'simple') {
      <span class="mz-loader-braille" aria-hidden="true">
        @for (frame of frames; track frame; let i = $index) {
          <span [style.--mz-braille-delay]="i * 80 + 'ms'">{{ frame }}</span>
        }
      </span>
    } @else {
      <span class="mz-loader-grid" aria-hidden="true">
        <span></span><span></span><span></span> <span></span><span></span
        ><span></span> <span></span><span></span><span></span>
        <span></span><span></span><span></span>
      </span>
    }
  `,
  styles: `
    :host(.mz-loader--grid) .mz-loader-grid {
      display: inline-grid;
      grid-template-columns: repeat(3, var(--mz-s, 5px));
      grid-template-rows: repeat(4, var(--mz-s, 5px));
      gap: var(--mz-gap, 2px);
    }
    :host(.mz-loader--grid) .mz-loader-grid > span {
      display: block;
      width: var(--mz-s, 5px);
      height: var(--mz-s, 5px);
      background: currentColor;
      opacity: 0.16;
      animation: mz-pulse 1.1s infinite steps(1);
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(2),
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(8),
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(11) {
      visibility: hidden;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(1) {
      animation-delay: 0ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(3) {
      animation-delay: 100ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(4) {
      animation-delay: 200ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(5) {
      animation-delay: 300ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(6) {
      animation-delay: 400ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(7) {
      animation-delay: 500ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(9) {
      animation-delay: 600ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(10) {
      animation-delay: 700ms;
    }
    :host(.mz-loader--grid) .mz-loader-grid > span:nth-child(12) {
      animation-delay: 800ms;
    }

    /* Simple variant — stacked braille glyphs, one visible per frame.
       The stack overlaps via absolute positioning; opacity flips
       between 1 and 0 in lockstep so exactly one frame paints at a
       time (steps(1) keeps it crisp, no fade). Total cycle: 10 frames
       × 80ms = 800ms. */
    :host(.mz-loader--simple) .mz-loader-braille {
      position: relative;
      display: inline-block;
      width: 1ch;
      height: 1em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-size: var(--mz-simple-size, 12px);
      line-height: 1;
      color: currentColor;
    }
    :host(.mz-loader--simple) .mz-loader-braille > span {
      position: absolute;
      inset: 0;
      opacity: 0;
      animation: mz-braille-pulse 800ms infinite steps(1);
      animation-delay: var(--mz-braille-delay, 0ms);
    }

    @keyframes mz-pulse {
      0% {
        opacity: 0.16;
      }
      50% {
        opacity: 1;
      }
    }
    @keyframes mz-braille-pulse {
      0%,
      10% {
        opacity: 1;
      }
      10.01%,
      100% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host(.mz-loader--grid) .mz-loader-grid > span {
        animation: none;
        opacity: 0.5;
      }
      :host(.mz-loader--simple) .mz-loader-braille > span {
        animation: none;
      }
      :host(.mz-loader--simple) .mz-loader-braille > span:first-child {
        opacity: 1;
      }
    }
  `,
})
export class MzLoader {
  readonly size = input<MzLoaderSize>('md');
  readonly variant = input<MzLoaderVariant>('grid');
  protected readonly frames = BRAILLE_FRAMES;
  protected readonly _s = computed(() => MZ_S[this.size()]);
  protected readonly _g = computed(() => MZ_G[this.size()]);
  protected readonly _simpleSize = computed(
    () => SIMPLE_FONT_SIZE[this.size()],
  );
}

export const MzLoaderImports = [MzLoader] as const;
