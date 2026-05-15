import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmResizableImports } from '@mozart/ui/resizable';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { map } from 'rxjs/operators';
import { HlmDialogService } from '@mozart/ui/dialog';
import { ProfileFacade } from '../../profile';
import {
  FeatureCommitDialog,
  FeatureCreatePrDialog,
  FeatureFileDiff,
  FeatureFileTree,
  RepositoriesFacade,
  type CommitDialogContext,
  type CreatePrDialogContext,
  type FileNode,
} from '../../repositories';
import { FeatureWorkspaceRun } from '../../runs';
import { FeatureWorkspaceTerminal } from '../../terminals';
import { IdeDetectionService } from '../data/ide-detection.service';
import { OPEN_IN_TOOLS, type OpenInTool } from '../data/open-in-tools';
import { WorkspacesFacade } from '../data/workspace.facade';
import { WorkspaceDetailStore } from '../feature-detail/workspace-detail.store';
import { WorkspaceAsideHeader } from '../ui/workspace-aside-header/workspace-aside-header';

type AsideTab = 'files' | 'terminal' | 'run';

const TAB_VALUES: readonly AsideTab[] = ['files', 'terminal', 'run'] as const;
const DEFAULT_TAB: AsideTab = 'files';

function coerceTab(raw: string | null): AsideTab {
  return (TAB_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as AsideTab)
    : DEFAULT_TAB;
}

@Component({
  selector: 'app-feature-workspace-aside',
  imports: [
    HlmTabsImports,
    HlmResizableImports,
    WorkspaceAsideHeader,
    FeatureFileTree,
    FeatureFileDiff,
    FeatureWorkspaceTerminal,
    FeatureWorkspaceRun,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <div data-tour="aside-header-buttons">
      <app-workspace-aside-header
        [branch]="branch()"
        [tools]="availableTools()"
        [lastUsedTool]="effectiveLastUsedTool()"
        [workspaceName]="workspaceName()"
        [githubConnected]="profile.githubConnected()"
        (openIn)="onOpenIn($event)"
        (commit)="onCommit()"
        (createPr)="onCreatePr()"
      />
    </div>

    <hlm-tabs
      [tab]="activeTab()"
      class="flex min-h-0 flex-1 flex-col gap-0"
      (tabActivated)="onTabActivated($event)"
    >
      <hlm-tabs-list
        variant="line"
        class="h-9 shrink-0 justify-start gap-0 border-b border-sidebar-border bg-sidebar px-2"
      >
        <button
          hlmTabsTrigger="files"
          type="button"
          class="text-xs font-normal"
          data-tour="aside-files-tab"
        >
          Files
        </button>
        <button
          hlmTabsTrigger="terminal"
          type="button"
          class="text-xs font-normal"
        >
          Terminal
        </button>
        <button
          hlmTabsTrigger="run"
          type="button"
          class="text-xs font-normal"
        >
          Run
        </button>
      </hlm-tabs-list>

      <div hlmTabsContent="files" class="min-h-0 flex-1">
        <hlm-resizable-group direction="vertical" class="h-full w-full">
          <hlm-resizable-panel
            [defaultSize]="35"
            [minSize]="20"
            class="overflow-hidden"
          >
            <app-feature-file-tree
              class="block h-full w-full"
              [workspaceId]="workspaceId()"
              [refreshTick]="watcherTick()"
              (fileSelected)="onFileSelected($event)"
            />
          </hlm-resizable-panel>
          <hlm-resizable-handle />
          <hlm-resizable-panel
            [defaultSize]="65"
            [minSize]="20"
            class="overflow-hidden"
          >
            <app-feature-file-diff
              class="block h-full w-full"
              [workspaceId]="workspaceId()"
              [path]="selectedPath()"
              [refreshTick]="watcherTick()"
            />
          </hlm-resizable-panel>
        </hlm-resizable-group>
      </div>

      <div hlmTabsContent="terminal" class="min-h-0 flex-1 overflow-hidden">
        <app-feature-workspace-terminal
          class="block h-full w-full"
          [workspaceId]="workspaceId()"
          [active]="activeTab() === 'terminal'"
        />
      </div>

      <div hlmTabsContent="run" class="min-h-0 flex-1 overflow-hidden">
        <app-feature-workspace-run
          class="block h-full w-full"
          [workspaceId]="workspaceId()"
          [active]="activeTab() === 'run'"
        />
      </div>
    </hlm-tabs>
  `,
})
export class FeatureWorkspaceAside {
  protected readonly store = inject(WorkspaceDetailStore);
  protected readonly profile = inject(ProfileFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly ides = inject(IdeDetectionService);
  private readonly dialog = inject(HlmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly availableTools = this.ides.availableTools;

  /** Falls back to the first available tool when the previously
   *  remembered choice isn't installed (e.g. user removed VSCode). */
  protected readonly effectiveLastUsedTool = computed<OpenInTool>(() => {
    const tools = this.availableTools();
    const last = this.store.lastUsedTool();
    if (tools.find((t) => t.id === last.id)) return last;
    return tools[0] ?? OPEN_IN_TOOLS[0];
  });

  // Reflects `?tab=...` from the URL; default `files` so the param can
  // stay absent in the canonical case.
  protected readonly activeTab = toSignal(
    this.route.queryParamMap.pipe(map((p) => coerceTab(p.get('tab')))),
    { initialValue: DEFAULT_TAB },
  );

  protected readonly branch = computed(() => this.store.currentBranch());

  protected readonly workspaceId = computed(() => this.workspaces.activeId());

  protected readonly workspaceName = computed(() => {
    const id = this.workspaceId();
    if (!id) return '';
    return this.workspaces.workspaceById(id)()?.name ?? '';
  });

  // Path of the file whose diff is mounted in the bottom Files panel.
  // Cleared whenever the active workspace changes.
  protected readonly selectedPath = signal<string | null>(null);

  // Bumped on every FS-watcher ping. Both file-tree and file-diff
  // children consume this as an input → effects re-run and re-fetch.
  protected readonly watcherTick = signal(0);

  // Active watcher unsubscribe; replaced when workspaceId changes,
  // called on destroy.
  private currentUnwatch: (() => void) | null = null;

  constructor() {
    // One watcher per active workspace. When the workspace changes
    // (or component is destroyed), tear down the previous subscription.
    effect((onCleanup) => {
      const id = this.workspaceId();
      // Reset diff selection on workspace change so the bottom panel
      // doesn't show a stale path from another worktree.
      this.selectedPath.set(null);
      this.detachWatcher();
      if (!id) return;
      void this.attachWatcher(id);
      onCleanup(() => this.detachWatcher());
    });
    this.destroyRef.onDestroy(() => this.detachWatcher());
  }

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    this.selectedPath.set(node.path);
  }

  protected async onOpenIn(tool: OpenInTool): Promise<void> {
    this.store.openIn(tool);
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.workspaces.openInIde(id, tool.id);
    } catch (err) {
      console.warn('[aside] open-in-ide failed:', err);
    }
  }

  protected onCommit(): void {
    const id = this.workspaceId();
    if (!id) return;
    const context: CommitDialogContext = {
      workspaceId: id,
      onCommitted: () => {
        // Bump the watcher tick so the file tree + diff re-fetch and
        // reflect the post-commit state immediately. The notify
        // watcher would also catch the change, but a direct kick keeps
        // the UI in sync without waiting for the debounce window.
        this.watcherTick.update((n) => n + 1);
      },
    };
    this.dialog.open(FeatureCommitDialog, { context });
  }

  protected onCreatePr(): void {
    const id = this.workspaceId();
    if (!id) return;
    const ws = this.workspaces.workspaceById(id)();
    const context: CreatePrDialogContext = {
      workspaceId: id,
      defaultTitle: ws?.name ?? '',
    };
    this.dialog.open(FeatureCreatePrDialog, { context });
  }

  protected onTabActivated(next: string): void {
    const tab = coerceTab(next);
    if (tab === this.activeTab()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === DEFAULT_TAB ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async attachWatcher(workspaceId: string): Promise<void> {
    try {
      const unwatch = await this.repos.watch(workspaceId, () => {
        // Each ping bumps the tick; both children re-fetch via their
        // own effects. The aside owns the single subscription.
        if (this.workspaceId() === workspaceId) {
          this.watcherTick.update((n) => n + 1);
        }
      });
      // If the workspace changed during the await, drop the late
      // subscription immediately.
      if (this.workspaceId() !== workspaceId) {
        try {
          unwatch();
        } catch (e) {
          console.warn('[aside] late unwatch failed:', e);
        }
        return;
      }
      this.currentUnwatch = unwatch;
    } catch (err) {
      console.warn('[aside] watch failed:', err);
    }
  }

  private detachWatcher(): void {
    const fn = this.currentUnwatch;
    this.currentUnwatch = null;
    if (!fn) return;
    try {
      fn();
    } catch (e) {
      console.warn('[aside] unwatch failed:', e);
    }
  }
}
