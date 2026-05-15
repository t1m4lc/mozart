import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { map } from 'rxjs/operators';
import { FeatureFileTree, type FileNode } from '../../repositories';
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
  imports: [HlmTabsImports, WorkspaceAsideHeader, FeatureFileTree],
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
        <app-feature-file-tree
          class="block h-full w-full"
          [workspaceId]="workspaceId()"
          (fileSelected)="onFileSelected($event)"
        />
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

  protected onFileSelected(node: FileNode): void {
    // Phase 4c will mount the diff view here. For now we surface the
    // selection via console so the wiring is testable end-to-end.
    console.debug('[aside] file selected:', node.path);
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
