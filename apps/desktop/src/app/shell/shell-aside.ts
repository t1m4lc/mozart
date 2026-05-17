import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitMerge, lucidePlay } from '@ng-icons/lucide';
import { OsService } from '../core/os.service';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { ProfileFacade } from '../domains/profile';
import { WorkspacesFacade } from '../domains/workspaces';
import { FeatureWorkspaceAside } from '../domains/workspaces/feature-workspace-aside/feature-workspace-aside';

// Right-aside shell. macOS traffic-light buttons live in the LEFT
// sidebar header (per the user's preference). Non-mac controls render
// here only when the OS chrome doesn't already provide them.
@Component({
  selector: 'app-shell-aside',
  imports: [
    HlmButtonImports,
    HlmIconImports,
    HlmSidebarImports,
    HlmTooltipImports,
    NgIcon,
    NonMacWindowControls,
    FeatureWorkspaceAside,
  ],
  providers: [provideIcons({ lucideGitMerge, lucidePlay })],
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
        class="h-9 flex-row items-center justify-end gap-1 bg-sidebar px-1 border-b border-sidebar-border"
      >
        <span class="flex-1" data-tauri-drag-region></span>
        @if (workspaces.activeId()) {
          <!-- Run — disabled stub. Workspace-level run lives in the
               aside bottom slot toolbar; this is the future "primary"
               surface (matches the IDE button look) but the wiring
               isn't ready yet, so the button reads as Coming soon. -->
          <button
            hlmBtn
            variant="default"
            size="sm"
            type="button"
            disabled
            hlmTooltip="Run — not available yet"
            position="bottom"
            class="h-7 px-2 text-xs font-normal"
            data-tauri-drag-region="false"
          >
            <ng-icon hlm name="lucidePlay" size="xs" />
            <span>Run</span>
          </button>

          @if (profile.githubConnected()) {
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              hlmTooltip="Open a pull request"
              position="bottom"
              class="h-7 px-2 text-xs font-normal"
              data-tauri-drag-region="false"
              (click)="onCreatePr()"
            >
              <ng-icon hlm name="lucideGitMerge" size="xs" />
              <span>Create PR</span>
            </button>
          }
        }
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
  protected readonly workspaces = inject(WorkspacesFacade);
  protected readonly profile = inject(ProfileFacade);
  private readonly dialog = inject(HlmDialogService);

  protected async onCreatePr(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    const ws = this.workspaces.workspaceById(id)();
    const { FeatureCreatePrDialog } = await import(
      '../domains/repositories/feature-create-pr-dialog/feature-create-pr-dialog'
    );
    this.dialog.open(FeatureCreatePrDialog, {
      context: { workspaceId: id, defaultTitle: ws?.name ?? '' },
    });
  }
}
