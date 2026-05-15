import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { OPEN_IN_TOOLS } from '../data/open-in-tools';
import { WorkspacesFacade } from '../data/workspace.facade';
import { WorkspaceDetailStore } from '../feature-detail/workspace-detail.store';
import { WorkspaceAsideHeader } from '../ui/workspace-aside-header/workspace-aside-header';

type AsideTab = 'files' | 'terminal' | 'run';

@Component({
  selector: 'app-feature-workspace-aside',
  imports: [HlmTabsImports, WorkspaceAsideHeader],
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

      <div hlmTabsContent="files" class="min-h-0 flex-1 overflow-auto">
        <div class="p-3 text-xs text-muted-foreground">
          Files coming soon.
        </div>
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

  protected readonly tools = OPEN_IN_TOOLS;

  protected readonly activeTab = signal<AsideTab>('files');

  protected readonly branch = computed(() => this.store.currentBranch());

  protected readonly workspaceName = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return '';
    return this.workspaces.workspaceById(id)()?.name ?? '';
  });

  protected onTabActivated(next: string): void {
    if (next === 'files' || next === 'terminal' || next === 'run') {
      this.activeTab.set(next);
    }
  }
}
