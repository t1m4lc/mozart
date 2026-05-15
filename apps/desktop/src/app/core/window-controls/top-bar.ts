import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OsService } from '../os.service';
import { MacWindowControls } from './mac-window-controls';
import { NonMacWindowControls } from './non-mac-window-controls';

// Shared top bar used by routes that don't render `AppShell` (e.g.
// `/welcome`, `/onboarding`, `/tour`). Provides :
//
//   - The Mozart logomark + wordmark — small, in the title-bar position.
//   - OS-correct window controls : Mac traffic lights on macOS,
//     Chrome-style minimize/maximize/close on Windows / Linux.
//   - A drag region (`data-tauri-drag-region`) so the user can grab
//     the bar to move the borderless window.
//
// Layout :
//   - macOS  : [traffic-lights] [logo + Mozart] ··············
//   - others : [logo + Mozart] ························ [_][□][×]
//
// `decorations: false` in tauri.conf.json hides the native title bar
// on every OS, so this component is the only thing rendering window
// controls when used.
@Component({
  selector: 'app-top-bar',
  imports: [MacWindowControls, NonMacWindowControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative z-10 flex h-9 w-full shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur',
    'data-tauri-drag-region': '',
  },
  template: `
    @if (isMac) {
      <app-mac-window-controls class="shrink-0" />
      <span class="w-2 shrink-0" data-tauri-drag-region></span>
    }
    <span
      class="text-muted-foreground flex items-center gap-2 text-xs font-medium"
      data-tauri-drag-region
    >
      <img src="/mozart.svg" alt="" class="size-4" />
      <span>Mozart</span>
    </span>
    <span class="flex-1" data-tauri-drag-region></span>
    @if (!isMac) {
      <app-non-mac-window-controls class="shrink-0" />
    }
  `,
})
export class TopBar {
  protected readonly isMac = inject(OsService).isMac();
}
