import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { WORKSPACE_PROCESSES_PANEL_HEIGHT } from '../../../shell/shell-panel.constants';
import { ProjectsFacade } from '../../projects';
import { FeatureWorkspaceRun, RunRegistry } from '../../runs';
import { FeatureWorkspaceTerminal } from '../../terminals';
import { UiStateFacade, type WorkspaceAsideBottomTab } from '../../ui-state';
import { WorkspacesFacade } from '../data/workspace.facade';
import { RunActionMenu } from '../ui/run-action-menu/run-action-menu';
import { FeatureWorkspaceSetup } from './feature-workspace-setup';

// Bottom half of the workspace aside: Setup / Run / Terminal tabs +
// a single Run/Stop button. No collapse — the panel is a fixed-height
// strip that's always visible. Each tab's body lives in its own
// component (Setup → FeatureWorkspaceSetup, Run → FeatureWorkspaceRun,
// Terminal → FeatureWorkspaceTerminal).
type BottomTab = WorkspaceAsideBottomTab;

const BOTTOM_TAB_VALUES: readonly BottomTab[] = [
  'setup',
  'run',
  'terminal',
] as const;
const DEFAULT_BOTTOM_TAB: BottomTab = 'run';

function coerceBottomTab(raw: string | null): BottomTab {
  return (BOTTOM_TAB_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as BottomTab)
    : DEFAULT_BOTTOM_TAB;
}

@Component({
  selector: 'app-feature-workspace-processes',
  imports: [
    HlmTabsImports,
    RunActionMenu,
    FeatureWorkspaceSetup,
    FeatureWorkspaceRun,
    FeatureWorkspaceTerminal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex shrink-0 flex-col overflow-hidden' },
  template: `
    <hlm-tabs
      class="contents"
      [tab]="bottomTab()"
      (tabActivated)="setBottomTab($any($event))"
    >
      <!-- Tab bar: Setup | Run | Terminal | spacer | Run/Stop.
           No fixed wrapper height — the inner h-9 children set it,
           same pattern as the files header so both bars resolve to
           exactly 37px (36px + 1px border-b). The bg-sidebar color
           change vs the file-tree content above is the visual
           separator (previously border-y added a top border too). -->
      <div
        class="flex items-stretch border-b border-sidebar-border bg-sidebar"
      >
        <hlm-tabs-list
          variant="line"
          class="flex items-stretch gap-0! bg-transparent p-0"
          aria-label="Workspace processes"
        >
          <button
            hlmTabsTrigger="setup"
            class="relative flex h-full items-center rounded-none border-transparent! bg-transparent! px-2 text-xs font-light text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:-bottom-px [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:rounded-full [&[data-state=active]]:after:bg-brand [&[data-state=active]]:after:shadow-[0_0_8px_hsl(var(--brand)/0.45)] [&[data-state=active]]:after:opacity-100"
          >
            Setup
          </button>
          <button
            hlmTabsTrigger="run"
            class="relative flex h-full items-center rounded-none border-transparent! bg-transparent! px-2 text-xs font-light text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:-bottom-px [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:rounded-full [&[data-state=active]]:after:bg-brand [&[data-state=active]]:after:shadow-[0_0_8px_hsl(var(--brand)/0.45)] [&[data-state=active]]:after:opacity-100"
          >
            Run
          </button>
          <button
            hlmTabsTrigger="terminal"
            class="relative flex h-full items-center rounded-none border-transparent! bg-transparent! px-2 text-xs font-light text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:-bottom-px [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:rounded-full [&[data-state=active]]:after:bg-brand [&[data-state=active]]:after:shadow-[0_0_8px_hsl(var(--brand)/0.45)] [&[data-state=active]]:after:opacity-100"
          >
            Terminal
          </button>
        </hlm-tabs-list>

        <span class="flex-1"></span>

        <!-- Split-button Run/Stop + dropdown chevron (chevron is
             disabled for now — no run variants yet). Mirrors the
             merge-action-menu pattern in the shell-aside header. -->
        <div class="my-1 mr-2 flex items-center">
          <app-run-action-menu
            [status]="runStatus()"
            [hasCommand]="hasRunCommand()"
            (start)="onStartRun()"
            (stop)="onStopRun()"
          />
        </div>
      </div>

      <!-- Tab content body — fixed expanded height, always visible.
           Content stays in the DOM so xterm + the Run panel survive
           tab switches. -->
      <div
        class="flex min-h-0 flex-col"
        [style.height]="WORKSPACE_PROCESSES_PANEL_HEIGHT"
      >
        <div hlmTabsContent="setup" class="h-full overflow-auto">
          <app-feature-workspace-setup />
        </div>

        <div hlmTabsContent="run" class="h-full overflow-hidden">
          <app-feature-workspace-run
            class="block h-full w-full"
            [workspaceId]="workspaceId()"
            [active]="bottomTab() === 'run'"
            (requestStart)="onStartRun()"
          />
        </div>

        <div hlmTabsContent="terminal" class="h-full overflow-hidden">
          <ng-template hlmTabsContentLazy>
            <app-feature-workspace-terminal
              class="block h-full w-full"
              [workspaceId]="workspaceId()"
              [active]="bottomTab() === 'terminal'"
            />
          </ng-template>
        </div>
      </div>
    </hlm-tabs>
  `,
})
export class FeatureWorkspaceProcesses {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly runs = inject(RunRegistry);
  private readonly uiState = inject(UiStateFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Exposed to the template for inline [style.height] binding.
  protected readonly WORKSPACE_PROCESSES_PANEL_HEIGHT =
    WORKSPACE_PROCESSES_PANEL_HEIGHT;

  protected readonly workspaceId = this.workspaces.activeId;

  // Live status of the active workspace's run. Drives the Run/Stop
  // button.
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
    const project = this.projects.byId(ws.projectId)();
    return !!project?.runCommand;
  });

  // Per-workspace tab state, persisted via UiStateStore.
  protected readonly asideState = this.uiState.asideStateFor(this.workspaceId);
  protected readonly bottomTab = computed(() => this.asideState().bottomTab);

  // Workspace ids whose `?tab=` URL hint has already been consumed.
  // First activation reads the hint into the store (only if no entry
  // exists yet), then clears the URL so it can't leak across workspaces.
  private readonly hydratedFromUrl = new Set<string>();

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (!id || this.hydratedFromUrl.has(id)) return;
      this.hydratedFromUrl.add(id);
      const raw = this.route.snapshot.queryParamMap.get('tab');
      const hasEntry = !!this.uiState.asideStateByWorkspace()[id];
      if (raw !== null && !hasEntry) {
        this.uiState.updateWorkspaceAsideState(id, {
          bottomTab: coerceBottomTab(raw),
        });
      }
      if (raw !== null) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { tab: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  // BrnTabs's `tabActivated` emits a plain `string`. Narrow before
  // write; defense against a `hlmTabsTrigger="..."` typo.
  protected setBottomTab(tab: string): void {
    if (!(BOTTOM_TAB_VALUES as readonly string[]).includes(tab)) return;
    const id = this.workspaceId();
    if (!id) return;
    if (tab === this.bottomTab()) return;
    this.uiState.updateWorkspaceAsideState(id, { bottomTab: tab as BottomTab });
  }

  protected async onStartRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.start(id);
      // Auto-jump to the Run tab so the user sees output the instant
      // the process starts.
      if (this.bottomTab() !== 'run') {
        this.uiState.updateWorkspaceAsideState(id, { bottomTab: 'run' });
      }
    } catch (err) {
      console.warn('[ws-processes] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[ws-processes] run stop failed:', err);
    }
  }
}
