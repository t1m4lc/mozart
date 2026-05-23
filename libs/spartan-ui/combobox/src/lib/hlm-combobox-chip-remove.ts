import { Directive } from '@angular/core';
import { BrnComboboxChipRemove } from '@spartan-ng/brain/combobox';
import { buttonVariants } from '@spartan-ui/button';
import { classes } from '@spartan-ui/utils';

@Directive({
	selector: 'button[hlmComboboxChipRemove]',
	hostDirectives: [BrnComboboxChipRemove],
	host: {
		'data-slot': 'combobox-chip-remove',
	},
})
export class HlmComboboxChipRemove {
	constructor() {
		classes(() => ['-ml-1 opacity-50 hover:opacity-100', buttonVariants({ variant: 'ghost', size: 'icon-xs' })]);
	}
}
