import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleStop, lucideGitMerge, lucidePlay } from '@ng-icons/lucide';
import { OsService } from '@mozart/shared-util-os';
import { toast } from '@spartan-ng/brain/sonner';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { ProfileFacade } from '../domains/profile';
import { ProjectsFacade } from '../domains/projects';
import { RunRegistry } from '../domains/runs';
import { WorkspacesFacade, type MergeAction } from '../domains/workspaces';
import { FeatureWorkspaceAside } from '../domains/workspaces/feature-workspace-aside/feature-workspace-aside';
import { MergeActionMenu } from '../domains/workspaces/ui/merge-action-menu/merge-action-menu';

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
    MergeActionMenu,
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

          <app-merge-action-menu
            [primaryAction]="mergePrimaryAction()"
            [githubConnected]="profile.githubConnected()"
            (pick)="onMergeActionPick($event)"
          />
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

  // AD-02 routing: workspace.lastMergeAction → project.mergeMode →
  // default 'pr'. `mergeModeFor` returns null until ensureMergeMode has
  // resolved; the effect below kicks it off whenever the active
  // workspace changes.
  protected readonly mergePrimaryAction = computed<MergeAction>(() => {
    const id = this.workspaces.activeId();
    if (!id) return 'pr';
    const ws = this.workspaces.workspaceById(id)();
    if (ws?.lastMergeAction) return ws.lastMergeAction;
    if (!ws) return 'pr';
    const mode = this.projects.mergeModeFor(ws.projectId)();
    return mode ?? 'pr';
  });

  constructor() {
    // Kick the lazy mergeMode read for the active workspace's project.
    effect(() => {
      const id = this.workspaces.activeId();
      if (!id) return;
      const ws = this.workspaces.workspaceById(id)();
      if (!ws) return;
      void this.projects.ensureMergeMode(ws.projectId);
    });
  }

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

  protected async onMergeActionPick(action: MergeAction): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    // AD-02 — persist the click outcome-independently so the label
    // sticks even on a precondition failure.
    void this.workspaces.setLastMergeAction(id, action).catch((err) => {
      console.warn('[shell-aside] persist last merge action failed:', err);
    });
    if (action === 'pr') {
      await this.openCreatePrDialog(id);
    } else {
      await this.runLocalMerge(id);
    }
  }

  private async openCreatePrDialog(workspaceId: string): Promise<void> {
    const ws = this.workspaces.workspaceById(workspaceId)();
    const { FeatureCreatePrDialog } = await import(
      '../domains/repositories/feature-create-pr-dialog/feature-create-pr-dialog'
    );
    this.dialog.open(FeatureCreatePrDialog, {
      context: { workspaceId, defaultTitle: ws?.name ?? '' },
    });
  }

  // P2.6 — Merge-now flow. Toast copy is locked by the plan:
  //  - "Commit your changes before merging."
  //  - "Pull <base name> first."
  //  - "Conflicts in N files. Resolve in your editor — Open in IDE"
  //  - "Merged into <base name>"
  private async runLocalMerge(workspaceId: string): Promise<void> {
    const ws = this.workspaces.workspaceById(workspaceId)();
    const baseName = ws?.baseBranch ?? 'base';
    try {
      const outcome = await this.workspaces.mergeLocally(workspaceId);
      if (outcome.status === 'conflict') {
        const n = outcome.conflicting_files.length;
        toast.error(
          `Conflicts in ${n} ${n === 1 ? 'file' : 'files'}. Resolve in your editor — Open in IDE`,
        );
        return;
      }
      toast.success(`Merged into ${baseName}`);
    } catch (err) {
      const kind = readAppErrorKind(err);
      if (kind === 'MergeDirtyTree') {
        toast.error('Commit your changes before merging.');
        return;
      }
      if (kind === 'MergeBaseAhead') {
        toast.error(`Pull ${baseName} first.`);
        return;
      }
      if (kind === 'Frozen') {
        toast.error('This workspace is read-only.');
        return;
      }
      console.warn('[shell-aside] merge failed:', err);
      toast.error('Merge failed.', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// `AppError` crosses the IPC boundary as `{ kind, message }`. Adapters
// re-throw the raw object; this guard lets the toast router pattern-
// match on `kind` without depending on a runtime type from `_bindings`.
function readAppErrorKind(err: unknown): string | null {
  if (
    err &&
    typeof err === 'object' &&
    'kind' in err &&
    typeof (err as { kind: unknown }).kind === 'string'
  ) {
    return (err as { kind: string }).kind;
  }
  return null;
}
