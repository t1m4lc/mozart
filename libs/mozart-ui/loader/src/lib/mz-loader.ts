import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

type MzLoaderSize = 'xs' | 'sm' | 'md';

const MZ_S: Record<MzLoaderSize, string> = { xs: '3px', sm: '5px', md: '7px' };
const MZ_G: Record<MzLoaderSize, string> = {
  xs: '1.5px',
  sm: '2px',
  md: '3px',
};

@Component({
  selector: 'mz-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-grid shrink-0',
    role: 'status',
    'aria-label': 'Loading',
    '[style.--mz-s]': '_s()',
    '[style.--mz-gap]': '_g()',
    '[style.grid-template-columns]': '"repeat(3,var(--mz-s))"',
    '[style.grid-template-rows]': '"repeat(3,var(--mz-s))"',
    '[style.gap]': '"var(--mz-gap)"',
  },
  template: `
    <span></span><span></span><span></span> <span></span><span></span
    ><span></span> <span></span><span></span><span></span>
  `,
  styles: `
    span {
      display: block;
      width: var(--mz-s, 5px);
      height: var(--mz-s, 5px);
      background: currentColor;
      opacity: 0.16;
      animation: mz-pulse 1.1s infinite steps(1);
    }
    span:nth-child(2),
    span:nth-child(8) {
      visibility: hidden;
    }

    span:nth-child(1) {
      animation-delay: 0ms;
    }
    span:nth-child(3) {
      animation-delay: 100ms;
    }
    span:nth-child(4) {
      animation-delay: 200ms;
    }
    span:nth-child(5) {
      animation-delay: 300ms;
    }
    span:nth-child(6) {
      animation-delay: 400ms;
    }
    span:nth-child(7) {
      animation-delay: 500ms;
    }
    span:nth-child(9) {
      animation-delay: 600ms;
    }

    @keyframes mz-pulse {
      0% {
        opacity: 0.16;
      }
      50% {
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      span {
        animation: none;
        opacity: 0.5;
      }
    }
  `,
})
export class MzLoader {
  readonly size = input<MzLoaderSize>('md');
  protected readonly _s = computed(() => MZ_S[this.size()]);
  protected readonly _g = computed(() => MZ_G[this.size()]);
}

export const MzLoaderImports = [MzLoader] as const;
