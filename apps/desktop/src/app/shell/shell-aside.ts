import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { OsService } from '../core/os.service';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { FeatureWorkspaceAside } from '../domains/workspaces/feature-workspace-aside/feature-workspace-aside';

// Right-aside shell. macOS traffic-light buttons live in the LEFT
// sidebar header (per the user's preference). Non-mac controls render
// here only when the OS chrome doesn't already provide them.
@Component({
  selector: 'app-shell-aside',
  imports: [HlmSidebarImports, NonMacWindowControls, FeatureWorkspaceAside],
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
      <div hlmSidebarContent class="min-h-0 flex-1 bg-transparent p-0">
        <app-feature-workspace-aside class="h-full w-full" />
      </div>
    </hlm-sidebar>
  `,
})
export class ShellAside {
  protected readonly isMac = inject(OsService).isMac();
}
