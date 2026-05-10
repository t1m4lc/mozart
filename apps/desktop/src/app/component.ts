import { Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUp } from '@ng-icons/lucide';

@Component({
  selector: 'app-button-preview',
  imports: [HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideArrowUp })],
  host: { class: 'flex flex-wrap items-center gap-2 md:flex-row' },
  template: `
    <button hlmBtn>Button Primary</button>
    <button hlmBtn variant="secondary" disabled>Button</button>
    <button hlmBtn variant="outline">Button</button>
    <button hlmBtn size="icon" variant="outline">
      <ng-icon name="lucideArrowUp" />
    </button>
  `,
})
export class ButtonPreview {}
