import { Directive } from '@angular/core';
import { classes } from '@mozart/ui/utils';

@Directive({ selector: '[hlmSelectValuesContent],hlm-select-values-content' })
export class HlmSelectValuesContent {
	constructor() {
		classes(() => 'flex gap-1');
	}
}
