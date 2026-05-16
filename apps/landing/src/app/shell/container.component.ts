import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'mx-auto block w-full max-w-screen-xl px-4 sm:px-6 lg:px-8',
  },
  template: `<ng-content />`,
})
export class ContainerComponent {}
