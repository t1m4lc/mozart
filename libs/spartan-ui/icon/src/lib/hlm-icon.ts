import { Directive, computed, input } from '@angular/core';
import { injectHlmIconConfig } from './hlm-icon.token';

// Size scale is icon-semantic, not strictly ascending — `md` (14px / 0.875rem)
// sits between `xs` (12px) and `sm` (16px). Reserved for chrome controls
// (Settings/Help/sidebar toggles) where 12px reads thin but 16px feels
// bulky. Values are in rem so they scale with the --app-zoom hook on <html>.
export type IconSize =
	| '3xs'
	| '2xs'
	| 'xs'
	| 'md'
	| 'sm'
	| 'base'
	| 'lg'
	| 'xl'
	| 'none'
	| (Record<never, never> & string);

@Directive({
	selector: 'ng-icon[hlmIcon], ng-icon[hlm]',
	host: {
		'[style.--ng-icon__size]': '_computedSize()',
	},
})
export class HlmIcon {
	private readonly _config = injectHlmIconConfig();
	public readonly size = input<IconSize>(this._config.size);

	protected readonly _computedSize = computed(() => {
		const size = this.size();

		switch (size) {
			case '3xs':
				return '0.5rem'; // 8px @ 16
			case '2xs':
				return '0.625rem'; // 10px @ 16
			case 'xs':
				return '0.75rem'; // 12px @ 16
			case 'md':
				return '0.875rem'; // 14px @ 16
			case 'sm':
				return '1rem'; // 16px @ 16
			case 'base':
				return '1.5rem'; // 24px @ 16
			case 'lg':
				return '2rem'; // 32px @ 16
			case 'xl':
				return '3rem'; // 48px @ 16
			default: {
				return size;
			}
		}
	});
}
