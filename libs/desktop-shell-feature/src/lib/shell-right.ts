import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NonMacWindowControls } from '@mozart/desktop-core-ui';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import {
  ProjectsFacade,
  type GithubRemoteStatus,
} from '@mozart/desktop-projects-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import type { CreatePrDialogContext } from '@mozart/desktop-repositories-feature';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import {
  WorkspacesFacade,
  decidePrAction,
} from '@mozart/desktop-workspaces-data-access';
import { FeatureWorkspaceAside } from '@mozart/desktop-workspaces-feature';
import { MergeActionMenu } from '@mozart/desktop-workspaces-ui';
import type { MergeAction } from '@mozart/desktop-workspaces-util';
import { OsService } from '@mozart/shared-util-os';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmSidebarImports } from '@spartan-ui/sidebar';
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
          class="h-10 flex-row items-center gap-2 bg-sidebar px-2 border-b border-sidebar-border"
        >
          <span class="flex-1" data-tauri-drag-region></span>
          <div class="flex gap-2">
            @if (workspaces.activeId()) {
              <app-merge-action-menu
                [primaryAction]="mergePrimaryAction"
                [prUrl]="prUrl()"
                [busy]="creatingPr()"
                [localMergeDisabled]="true"
                (pick)="onMergeActionPick($event)"
                (viewPr)="onViewPr()"
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
  private readonly repos = inject(RepositoriesFacade);
  private readonly dialog = inject(HlmDialogService);
  private readonly externalLink = inject(ExternalLinkService);

  // True while a PR is being pushed/opened on the fast path (clean
  // tree). Drives the merge menu's primary-button loader.
  protected readonly creatingPr = signal(false);

  // URL of the PR already opened from the active workspace, if any.
  // Drives the merge menu's "View PR" affordance.
  protected readonly prUrl = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return null;
    return this.workspaces.workspaceById(id)()?.pr?.url ?? null;
  });

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

  constructor() {
    // Kick the lazy GitHub-remote-status read for the active workspace's
    // project. De-duped inside `ensureGithubRemoteStatus`, so re-firing
    // on every active-workspace change is cheap.
    effect(() => {
      const id = this.workspaces.activeId();
      if (!id) return;
      const ws = this.workspaces.workspaceById(id)();
      if (!ws) return;
      void this.projects.ensureGithubRemoteStatus(ws.projectId);
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
      await this.startPrFlow(id);
    } else {
      await this.runLocalMerge(id);
    }
  }

  // Open the existing PR in the browser. Stays inside Mozart otherwise
  // (no auto-navigation) — only fires on the explicit "View PR" click.
  protected onViewPr(): void {
    const url = this.prUrl();
    if (url) void this.externalLink.openExternal(url);
  }

  // Pre-flight router for the "Create PR" click. Gathers the live gates
  // (auth / remote / working tree) then performs exactly one action, so
  // the user is only interrupted when something is actually required:
  //   not connected → connect dialog · non-github → toast ·
  //   dirty tree → commit dialog · ready → create directly (no modal).
  private async startPrFlow(workspaceId: string): Promise<void> {
    const ws = this.workspaces.workspaceById(workspaceId)();
    if (!ws) return;

    let remote: GithubRemoteStatus | null = null;
    let changedPaths: readonly string[] = [];
    let hasBranchChanges = false;
    try {
      const [r, changed, branchFiles] = await Promise.all([
        this.projects.ensureGithubRemoteStatus(ws.projectId),
        this.repos.listChangedFiles(workspaceId),
        this.repos.listBranchDiffFiles(workspaceId),
      ]);
      remote = r;
      changedPaths = changed.map((f) => f.path);
      hasBranchChanges = branchFiles.length > 0;
    } catch (err) {
      console.warn('[shell-right] pr pre-flight failed:', err);
      toast.error("Couldn't check the workspace before creating a PR.", {
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const decision = decidePrAction({
      connected: this.profile.githubConnected(),
      remote,
      changedPaths,
      hasBranchChanges,
    });

    switch (decision.kind) {
      case 'connect':
        await this.openConnectGithubDialog();
        return;
      case 'blocked-remote':
        toast.error(decision.message);
        return;
      case 'no-changes':
        toast.error('Nothing to create a PR for — make and commit some changes first.');
        return;
      case 'commit':
        await this.openCommitAndPrDialog(workspaceId, ws.name, ws.branch, decision.paths);
        return;
      case 'create':
        await this.createPrDirect(workspaceId, ws.name);
        return;
    }
  }

  private async openConnectGithubDialog(): Promise<void> {
    const { UiGithubConnectDialog } = await import(
      '@mozart/desktop-profile-feature'
    );
    this.dialog.open(UiGithubConnectDialog, {});
  }

  private async openCommitAndPrDialog(
    workspaceId: string,
    name: string,
    branch: string,
    changedPaths: readonly string[],
  ): Promise<void> {
    const { FeatureCreatePrDialog } = await import(
      '@mozart/desktop-repositories-feature'
    );
    const context: CreatePrDialogContext = {
      workspaceId,
      defaultTitle: name,
      branch,
      changedPaths,
      onCreated: (pr) => this.announcePrCreated(pr),
    };
    this.dialog.open(FeatureCreatePrDialog, { context });
  }

  private async createPrDirect(workspaceId: string, name: string): Promise<void> {
    this.creatingPr.set(true);
    try {
      const { pr, statusFlipFailed } = await this.workspaces.createPr(
        workspaceId,
        name.trim() || 'Mozart pull request',
        '',
        false,
      );
      this.announcePrCreated({
        url: pr.htmlUrl,
        number: pr.number,
        statusFlipFailed,
      });
    } catch (err) {
      console.warn('[shell-right] create pr failed:', err);
      toast.error('Failed to create the pull request.', {
        description: err instanceof Error ? err.message : readAppErrorMessage(err),
      });
    } finally {
      this.creatingPr.set(false);
    }
  }

  // Single success surface for both the fast path and the commit dialog
  // so the toast UX is identical. The PR chip + "View PR" affordance
  // update reactively off the store (no refresh) — the toast just gives
  // an immediate jump-to-GitHub action.
  private announcePrCreated(pr: {
    readonly url: string;
    readonly number: number;
    readonly statusFlipFailed: boolean;
  }): void {
    toast.success(`Pull request #${pr.number} opened`, {
      action: {
        label: 'Open in GitHub',
        onClick: () => void this.externalLink.openExternal(pr.url),
      },
    });
    if (pr.statusFlipFailed) {
      toast.error('PR opened, but status update failed — refresh to retry.');
    }
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

// Same boundary shape, but pulls `.message` — so a raw `AppError`
// renders its text in a toast instead of "[object Object]".
function readAppErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message;
  }
  return String(err);
}
