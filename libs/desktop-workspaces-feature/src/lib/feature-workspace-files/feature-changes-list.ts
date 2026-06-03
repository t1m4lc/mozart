import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
} from '@angular/core';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronUp } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { MzDiffStats } from '@mozart-ui/diff-stats';
import {
  RepositoriesFacade,
  type ChangedFile,
} from '@mozart/desktop-repositories-data-access';
import {
  UiConfirmDiscardChangesDialog,
  type ConfirmDiscardChangesContext,
} from '@mozart/desktop-repositories-ui';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  FileTabsService,
  WorkspaceMutationsFacade,
  WorkspacesFacade,
} from '@mozart/desktop-workspaces-data-access';
import { createClickIntentGuard } from './click-intent-guard';

// Shared empty array — keeps the section accessors reference-stable on
// a cache miss so the `@for` loops don't churn on every CD pass while
// the split is still null.
const EMPTY_CHANGED_FILES: readonly ChangedFile[] = [];

// Body of the Changes tab inside `app-feature-workspace-files`.
// Renders two collapsible groups — "Uncommitted" (working tree) and
// "Committed" (`base...HEAD`) — over a shared row template, plus the
// mutation handlers (toggle stage, copy path, discard). The parent
// owns the tabs frame + the FS watcher + the agent-run auto-route;
// this child only paints the Changes list and runs its actions.
//
// host: 'contents' so the new component host is transparent to the
// parent's flex layout — the wrapper <div hlmTabsContent="changes"
// class="flex min-h-0 flex-1 flex-col overflow-y-auto"> keeps its
// scroll role; this component's children flow into it as if they
// were direct siblings of the wrapper.
@Component({
  selector: 'app-feature-changes-list',
  imports: [
    NgTemplateOutlet,
    NgIcon,
    HlmIconImports,
    MzDiffStats,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (!hasChanges()) {
      <p class="p-4 text-xs text-muted-foreground">No changes yet.</p>
    } @else {
      @if (uncommittedFiles().length > 0) {
        <button
          type="button"
          (click)="toggleUncommittedOpen()"
          class="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ng-icon
            hlm
            [name]="uncommittedOpen() ? 'lucideChevronDown' : 'lucideChevronUp'"
            size="3xs"
          />
          <span>Uncommitted ({{ uncommittedFiles().length }})</span>
        </button>
        @if (uncommittedOpen()) {
          <ul class="flex flex-col">
            @for (file of uncommittedFiles(); track file.path) {
              <li>
                <ng-container
                  [ngTemplateOutlet]="changedRowTpl"
                  [ngTemplateOutletContext]="{ $implicit: file }"
                />
              </li>
            }
          </ul>
        }
      }
      @if (committedFiles().length > 0) {
        <button
          type="button"
          (click)="toggleCommittedOpen()"
          class="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ng-icon
            hlm
            [name]="committedOpen() ? 'lucideChevronDown' : 'lucideChevronUp'"
            size="3xs"
          />
          <span>Committed ({{ committedFiles().length }})</span>
        </button>
        @if (committedOpen()) {
          <ul class="flex flex-col pb-2">
            @for (file of committedFiles(); track file.path) {
              <li>
                <ng-container
                  [ngTemplateOutlet]="changedRowTpl"
                  [ngTemplateOutletContext]="{ $implicit: file }"
                />
              </li>
            }
          </ul>
        }
      }
    }

    <ng-template #changedRowTpl let-file>
      <button
        type="button"
        [attr.aria-current]="
          activeFilePath() === file.path ? 'true' : null
        "
        class="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground aria-[current=true]:bg-brand/10 aria-[current=true]:text-foreground"
        (click)="onChangedFileClick(file)"
        (dblclick)="onChangedFileDblClick(file)"
      >
        <span
          class="inline-block w-4 shrink-0 text-center font-mono text-[10px]"
          [class]="statusFgClass(file.status)"
        >
          {{ statusLetter(file.status) }}
        </span>
        <span class="min-w-0 flex-1 truncate font-mono">{{ file.path }}</span>
        <mz-diff-stats
          class="ml-auto"
          [added]="file.added"
          [removed]="file.removed"
        />
      </button>
    </ng-template>
  `,
})
export class FeatureChangesList {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly fileTabs = inject(FileTabsService);
  private readonly mutations = inject(WorkspaceMutationsFacade);
  private readonly dialogService = inject(HlmDialogService);
  private readonly uiState = inject(UiStateFacade);
  private readonly clickGuard = createClickIntentGuard();

  private readonly workspaceId = this.workspaces.activeId;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clickGuard.dispose());
  }

  // Per-workspace group-open state, persisted via UiStateStore.
  private readonly asideState = this.uiState.asideStateFor(this.workspaceId);
  protected readonly uncommittedOpen = computed(
    () => this.asideState().uncommittedOpen,
  );
  protected readonly committedOpen = computed(
    () => this.asideState().committedOpen,
  );

  // Active-row highlight when the user has a file open in the central
  // shell that matches a changed entry.
  protected readonly activeFilePath = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.fileTabs.activeFor(id)();
  });

  // Reads through the same cache the parent's tab-count badge uses —
  // single source of truth, same signal subscriptions. The split keeps
  // the two sections coherent under one revision.
  private readonly split = this.repos.cachedChangedSplitFor(this.workspaceId);
  protected readonly uncommittedFiles = computed<readonly ChangedFile[]>(
    () => this.split()?.uncommitted ?? EMPTY_CHANGED_FILES,
  );
  protected readonly committedFiles = computed<readonly ChangedFile[]>(
    () => this.split()?.committed ?? EMPTY_CHANGED_FILES,
  );
  protected readonly hasChanges = computed(
    () => this.uncommittedFiles().length > 0 || this.committedFiles().length > 0,
  );

  protected toggleUncommittedOpen(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, {
      uncommittedOpen: !this.uncommittedOpen(),
    });
  }

  protected toggleCommittedOpen(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, {
      committedOpen: !this.committedOpen(),
    });
  }

  // Single-click: open the diff in the reusable file tab (deferred so a
  // double-click can cancel it). Double-click: pin a new tab.
  protected onChangedFileClick(file: ChangedFile): void {
    this.clickGuard.single(() => this.openFileFromChanges(file.path, 'preview'));
  }

  protected onChangedFileDblClick(file: ChangedFile): void {
    this.clickGuard.double(() => this.openFileFromChanges(file.path, 'pin'));
  }

  protected statusLetter(status: ChangedFile['status']): string {
    switch (status) {
      case 'added':
        return 'A';
      case 'modified':
        return 'M';
      case 'deleted':
        return 'D';
    }
  }

  protected statusFgClass(status: ChangedFile['status']): string {
    switch (status) {
      case 'added':
        return 'text-status-added';
      case 'modified':
        return 'text-status-modified';
      case 'deleted':
        return 'text-status-deleted';
    }
  }

  /** Flip the file's staged state via `git add` / `git reset HEAD`.
   *  Triggers the same soft-refresh path the FS-watcher uses so the
   *  Changes pane reflects the new staged flag without waiting for
   *  the watcher's debounce window. */
  protected async onToggleStaged(file: ChangedFile): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      if (file.staged) {
        await this.repos.unstageFile(id, file.path);
      } else {
        await this.repos.stageFile(id, file.path);
      }
      this.mutations.softRefreshAfterMutation(id);
    } catch (err) {
      console.warn('[ws-changes] toggle staged failed:', err);
      toast.error('Could not change staged state', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  protected async onCopyPath(file: ChangedFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.path);
      toast.success('Path copied');
    } catch (err) {
      console.warn('[ws-changes] copy path failed:', err);
      toast.error('Could not copy path');
    }
  }

  /** Destructive — open a confirmation dialog first; on confirm reuse
   *  the workspace-level reset command. */
  protected onDiscardChanges(file: ChangedFile): void {
    const id = this.workspaceId();
    if (!id) return;
    const context: ConfirmDiscardChangesContext = {
      path: file.path,
      onConfirm: async () => {
        try {
          await this.repos.discardWorkspaceChanges(id);
          this.mutations.softRefreshAfterMutation(id);
        } catch (err) {
          toast.error('Could not discard changes', {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      },
    };
    this.dialogService.open(UiConfirmDiscardChangesDialog, { context });
  }

  private openFileFromChanges(
    path: string,
    intent: 'preview' | 'pin',
  ): void {
    const id = this.workspaceId();
    if (!id) return;
    const workspace = this.workspaces.workspaceById(id)();
    if (!workspace) return;
    // Routes via FileTabsService.navigateToFileTab so router state +
    // per-path mode are set in one place; the tab effect in
    // `WorkspaceTabContent` reads the intent and dispatches.
    void this.fileTabs.navigateToFileTab({
      projectId: workspace.projectId,
      workspaceId: id,
      path,
      intent,
      mode: 'diff',
      source: 'changes',
    });
  }
}
