import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OsService } from '@mozart/shared-util-os';
import { MacWindowControls } from './mac-window-controls';
import { NonMacWindowControls } from './non-mac-window-controls';

@Component({
  selector: 'app-top-bar',
  imports: [MacWindowControls, NonMacWindowControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative  z-10 flex h-10 w-full shrink-0 items-center justify-center border-b border-border bg-background/80 px-3 backdrop-blur',
  },
  template: `
    @if (isMac) {
      <app-mac-window-controls
        class="absolute left-3 top-1/2 -translate-y-1/2"
      />
    } @else {
      <img
        src="/assets/shared/logos/mozart-logo.svg"
        alt=""
        class="size-6 absolute left-3 top-1/2 -translate-y-1/2"
      />
    }
    <span
      class="text-muted-foreground  w-full h-full flex items-center justify-center gap-2 text-xs font-medium"
      data-tauri-drag-region
    >
      Mozart desktop
    </span>
    @if (!isMac) {
      <app-non-mac-window-controls
        class="absolute right-1 top-1/2 -translate-y-1/2"
      />
    }
  `,
})
export class TopBar {
  protected readonly isMac = inject(OsService).isMac();
}
