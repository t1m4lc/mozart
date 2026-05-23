import { Directive } from '@angular/core';
import { classes } from '@spartan-ui/utils';

@Directive({
	selector: 'ul[hlmPaginationContent]',
	host: { 'data-slot': 'pagination-content' },
})
export class HlmPaginationContent {
	constructor() {
		classes(() => 'gap-1 flex items-center');
	}
}
