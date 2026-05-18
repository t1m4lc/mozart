import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleStop, lucideGitMerge, lucidePlay } from '@ng-icons/lucide';
import { OsService } from '../core/os.service';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { ProfileFacade } from '../domains/profile';
import { ProjectsFacade } from '../domains/projects';
import { RunRegistry } from '../domains/runs';
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
  providers: [provideIcons({ lucideCircleStop, lucideGitMerge, lucidePlay })],
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
          @if (runStatus() === 'running') {
            <button
              type="button"
              hlmTooltip="Stop the run"
              position="bottom"
              class="inline-flex h-6 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-xs text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-tauri-drag-region="false"
              (click)="onStopRun()"
            >
              <ng-icon hlm name="lucideCircleStop" size="xs" />
              <span>Stop</span>
            </button>
          } @else {
            <button
              type="button"
              hlmTooltip="Run the configured command"
              position="bottom"
              class="inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-muted px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              [disabled]="!hasRunCommand()"
              data-tauri-drag-region="false"
              (click)="onRun()"
            >
              <ng-icon hlm name="lucidePlay" size="xs" />
              <span>Run</span>
            </button>
          }

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
  private readonly projects = inject(ProjectsFacade);
  private readonly runs = inject(RunRegistry);
  private readonly dialog = inject(HlmDialogService);

  protected readonly runStatus = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  protected readonly hasRunCommand = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return false;
    const ws = this.workspaces.workspaceById(id)();
    if (!ws) return false;
    return !!this.projects.byId(ws.projectId)()?.runCommand;
  });

  protected async onRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.start(id);
    } catch (err) {
      console.warn('[shell-aside] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[shell-aside] run stop failed:', err);
    }
  }

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
