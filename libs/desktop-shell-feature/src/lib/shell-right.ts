import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { OsService } from '@mozart/shared-util-os';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmSidebarImports } from '@spartan-ui/sidebar';
import { toast } from '@spartan-ng/brain/sonner';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { NonMacWindowControls } from '@mozart/desktop-core-ui';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import type { MergeAction } from '@mozart/desktop-workspaces-util';
import { MergeActionMenu } from '@mozart/desktop-workspaces-ui';
import { FeatureWorkspaceAside } from '@mozart/desktop-workspaces-feature';
import { SHELL_RIGHT_PANEL_WIDTH } from './shell-panel.constants';
import { ShellSidePanel } from './shell-side-panel';

// Right shell panel. Outer collapse chrome lives in
// <app-shell-side-panel> (shared with shell-left). Owns the
// visibility gate (only shown when a workspace is active AND the
// user has the panel toggled open) and the right-specific content:
// merge-action header + workspace aside body.
//
// On compact viewports (below Tailwind's `lg` = 1024px) the inline
// panel is CSS-hidden and the workspace toolbar swaps in a sheet
// trigger so the content stays reachable. `hideOnCompact=true` on
// the shared primitive does that.
@Component({
  selector: 'app-shell-right',
  imports: [
    HlmSidebarImports,
    NonMacWindowControls,
    FeatureWorkspaceAside,
    MergeActionMenu,
    ShellSidePanel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <app-shell-side-panel
      side="right"
      [open]="_visible()"
      [width]="_fullWidth"
      [hideOnCompact]="true"
    >
      <hlm-sidebar
        side="right"
        collapsible="none"
        class="h-full w-full bg-transparent"
      >
        <div
          hlmSidebarHeader
          data-tauri-drag-region
          class="h-10 flex-row items-center justify-end gap-1 bg-sidebar px-1 border-b border-sidebar-border"
        >
          <span class="flex-1" data-tauri-drag-region></span>
          <div class="flex gap-2">
            @if (workspaces.activeId()) {
              <app-merge-action-menu
                [primaryAction]="mergePrimaryAction"
                [githubConnected]="profile.githubConnected()"
                [isGithubRemote]="isGithubRemote()"
                [localMergeDisabled]="true"
                (pick)="onMergeActionPick($event)"
              />
            }
            @if (!isMac) {
              <app-non-mac-window-controls />
            }
          </div>
        </div>
        <div hlmSidebarContent class="min-h-0 flex-1 bg-transparent p-0">
          <!-- On compact viewports the inline shell-right is CSS-hidden
               AND its feature-workspace-aside is NOT mounted, so the
               sheet-mounted copy is the only consumer of the terminal
               registry. Avoids the xterm element being yanked between
               two simultaneous mounts. -->
          @if (!layout.isCompact()) {
            <app-feature-workspace-aside class="h-full w-full" />
          }
        </div>
      </hlm-sidebar>
    </app-shell-side-panel>
  `,
})
export class ShellRight {
  protected readonly isMac = inject(OsService).isMac();
  protected readonly workspaces = inject(WorkspacesFacade);
  protected readonly profile = inject(ProfileFacade);
  protected readonly layout = inject(LayoutService);
  private readonly projects = inject(ProjectsFacade);
  private readonly dialog = inject(HlmDialogService);

  // Right pane is only meaningful inside a workspace context, and the
  // user can additionally toggle it via the workspace toolbar. Fed
  // into <app-shell-side-panel>'s `open` input.
  protected readonly _visible = computed(
    () => this.workspaces.activeId() !== null && this.layout.rightPanelOpen(),
  );

  // Constant — only the side panel's host width animates between this
  // and 0 (driven by ShellSidePanel from `_visible`).
  protected readonly _fullWidth = SHELL_RIGHT_PANEL_WIDTH;

  // P1.1 D5 — collapsed to a 'pr' constant while local-merge is hidden
  // behind the Soon badge. When the local-merge flow ships, restore the
  // AD-02 routing computed (workspace.lastMergeAction →
  // project.mergeMode → default 'pr') and re-add `ensureMergeMode` to
  // the effect below.
  protected readonly mergePrimaryAction: MergeAction = 'pr';

  // P1.1 D9 — gates the PR primary + dropdown row. Null until the
  // backend probe resolves; treat null as `false` (defensive) so the
  // button starts disabled and flips on once we've confirmed the
  // origin really is github.com.
  protected readonly isGithubRemote = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return false;
    const ws = this.workspaces.workspaceById(id)();
    if (!ws) return false;
    return this.projects.isGithubRemoteFor(ws.projectId)() ?? false;
  });

  constructor() {
    // Kick the lazy isGithubRemote read for the active workspace's
    // project. De-duped inside `ensureIsGithubRemote`, so re-firing on
    // every active-workspace change is cheap.
    effect(() => {
      const id = this.workspaces.activeId();
      if (!id) return;
      const ws = this.workspaces.workspaceById(id)();
      if (!ws) return;
      void this.projects.ensureIsGithubRemote(ws.projectId);
    });
  }

  protected async onMergeActionPick(action: MergeAction): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    // AD-02 — persist the click outcome-independently so the label
    // sticks even on a precondition failure.
    void this.workspaces.setLastMergeAction(id, action).catch((err) => {
      console.warn('[shell-right] persist last merge action failed:', err);
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
      '@mozart/desktop-repositories-feature'
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
      console.warn('[shell-right] merge failed:', err);
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
