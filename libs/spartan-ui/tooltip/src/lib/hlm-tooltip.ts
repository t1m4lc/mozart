import { Directive } from '@angular/core';
import { hlm } from '@spartan-ui/utils';
import {
  BrnTooltip,
  BrnTooltipPosition,
  provideBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';
import { cva } from 'class-variance-authority';

export const DEFAULT_TOOLTIP_SVG_CLASS = 'hidden size-0';

export const DEFAULT_TOOLTIP_CONTENT_CLASSES =
  'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) ' +
  'rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-base text-popover-foreground shadow-sm ' +
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.90] ' +
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.90]';

export const DEFAULT_TOOLTIP_SHOW_DELAY = 400;

export const tooltipPositionVariants = cva('absolute', {
  variants: {
    position: {
      top: 'bottom-0 left-[calc(50%-5px)] translate-y-full',
      bottom: '-top-2.5 left-[calc(50%-5px)] translate-y-0 rotate-180',
      left: '-inset-e-2.5 top-[calc(50%-5px)] translate-y-0 rotate-270 rtl:-rotate-270',
      right:
        '-inset-s-2.5 top-[calc(50%-5px)] translate-y-0 rotate-90 rtl:-rotate-90',
    },
  },
});

@Directive({
  selector: '[hlmTooltip]',
  providers: [
    provideBrnTooltipDefaultOptions({
      showDelay: DEFAULT_TOOLTIP_SHOW_DELAY,
      svgClasses: DEFAULT_TOOLTIP_SVG_CLASS,
      tooltipContentClasses: DEFAULT_TOOLTIP_CONTENT_CLASSES,
      arrowClasses: (position: BrnTooltipPosition) =>
        hlm(tooltipPositionVariants({ position })),
    }),
  ],
  hostDirectives: [
    {
      directive: BrnTooltip,
      inputs: [
        'brnTooltip: hlmTooltip',
        'position',
        'hideDelay',
        'showDelay',
        'tooltipDisabled',
      ],
    },
  ],
})
export class HlmTooltip {}
