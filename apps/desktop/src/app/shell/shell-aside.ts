import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { OsService } from '../core/os.service';
import { MacWindowControls } from '../core/window-controls/mac-window-controls';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { FeatureWorkspaceAside } from '../domains/workspaces/feature-workspace-aside/feature-workspace-aside';

// Right-aside shell. Per IMP-003 the macOS traffic-light buttons live
// here when a workspace is selected (audit's recommended placement —
// "right edge of right aside header"). The dashboard-state placement
// is handled by AppShell (top-right of the central column when no
// workspace is active).
@Component({
  selector: 'app-shell-aside',
  imports: [
    HlmSidebarImports,
    MacWindowControls,
    NonMacWindowControls,
    FeatureWorkspaceAside,
  ],
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
        @if (isMac) {
          <app-mac-window-controls />
        } @else {
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
