import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmResizableImports } from '@mozart/ui/resizable';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { map } from 'rxjs/operators';
import {
  FeatureFileDiff,
  FeatureFileTree,
  type FileNode,
} from '../../repositories';
import { OPEN_IN_TOOLS } from '../data/open-in-tools';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <app-workspace-aside-header
      [branch]="branch()"
      [tools]="tools"
      [lastUsedTool]="store.lastUsedTool()"
      [workspaceName]="workspaceName()"
      (openIn)="store.openIn($event)"
    />

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

      <div hlmTabsContent="terminal" class="min-h-0 flex-1 overflow-auto">
        <div class="p-3 text-xs text-muted-foreground">
          Terminal coming soon.
        </div>
      </div>

      <div hlmTabsContent="run" class="min-h-0 flex-1 overflow-auto">
        <div class="p-3 text-xs text-muted-foreground">
          Run coming soon.
        </div>
      </div>
    </hlm-tabs>
  `,
})
export class FeatureWorkspaceAside {
  protected readonly store = inject(WorkspaceDetailStore);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tools = OPEN_IN_TOOLS;

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
  // Cleared whenever the active workspace changes (handled by an effect
  // that watches workspaceId and resets selectedPath when it shifts).
  protected readonly selectedPath = signal<string | null>(null);

  // Bumped on FS-watcher pings (Atom 4c-3 lifts the subscription here);
  // for atom 2 only, this stays at 0 so the diff component still has a
  // stable input shape.
  protected readonly watcherTick = signal(0);

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    this.selectedPath.set(node.path);
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
}
