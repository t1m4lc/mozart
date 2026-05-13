import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { OsService } from '../core/os.service';
import { NonMacWindowControls } from './non-mac-window-controls';

@Component({
  selector: 'app-shell-aside',
  imports: [HlmSidebarImports, NonMacWindowControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-sidebar
      side="right"
      collapsible="none"
      class="h-full w-full bg-transparent"
    >
      <div
        hlmSidebarHeader
        data-tauri-drag-region
        class="h-9 flex-row items-center justify-end bg-sidebar p-1 border-b border-sidebar-border"
      >
        <span class="flex-1" data-tauri-drag-region></span>
        @if (!isMac) {
          <app-non-mac-window-controls />
        }
      </div>
      <div hlmSidebarContent class="bg-transparent">
        <!-- TODO: aside (Files / Terminal / Run in v0.0.2) -->
      </div>
    </hlm-sidebar>
  `,
})
export class ShellAside {
  protected readonly isMac = inject(OsService).isMac();
}
