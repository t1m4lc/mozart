import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import {
  HlmResizableImports,
  HlmResizablePanel,
} from '@mozart/ui/resizable';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronUp } from '@ng-icons/lucide';
import { map } from 'rxjs/operators';
import {
  FeatureFileDiff,
  FeatureFileTree,
  RepositoriesFacade,
  type FileNode,
} from '../../repositories';
import { FeatureWorkspaceRun } from '../../runs';
import { FeatureWorkspaceTerminal } from '../../terminals';
import { WorkspacesFacade } from '../data/workspace.facade';

// IMP-021 — the right aside is a vertical split:
//   - Top : Files (inner tree-over-diff split)
//   - Bottom : 3 tabs (Setup / Run / Terminal) — Run is default
// The tab bar is pinned at the bottom edge and stays visible even when
// the bottom slot is collapsed. Collapsing drops the bottom panel size
// to 0 (the tab bar handles the toggle); expanding restores a 50/50
// split. Run + Terminal are lazy-loaded via `@defer` so xterm and the
// run-command machinery don't bloat the main bundle.
type BottomTab = 'setup' | 'run' | 'terminal';

const BOTTOM_TAB_VALUES: readonly BottomTab[] = [
  'setup',
  'run',
  'terminal',
] as const;
const DEFAULT_BOTTOM_TAB: BottomTab = 'run';

const BOTTOM_OPEN_PERCENT = 50;
// Small non-zero percent leaves enough room for the tab bar (~36 px)
// at typical aside heights. The tab bar lives at the top of the
// bottom panel so it stays visible when the slot is collapsed.
const BOTTOM_COLLAPSED_PERCENT = 6;

function coerceBottomTab(raw: string | null): BottomTab {
  return (BOTTOM_TAB_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as BottomTab)
    : DEFAULT_BOTTOM_TAB;
}

@Component({
  selector: 'app-feature-workspace-aside',
  imports: [
    HlmButtonImports,
    HlmIconImports,
    HlmResizableImports,
    HlmTooltipImports,
    NgIcon,
    FeatureFileTree,
    FeatureFileDiff,
    FeatureWorkspaceRun,
    FeatureWorkspaceTerminal,
  ],
  providers: [provideIcons({ lucideChevronDown, lucideChevronUp })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <hlm-resizable-group direction="vertical" class="min-h-0 flex-1">
      <!-- Top slot : Files (inner tree-over-diff split) -->
      <hlm-resizable-panel
        [defaultSize]="50"
        [minSize]="20"
        class="overflow-hidden"
      >
        <hlm-resizable-group
          direction="vertical"
          class="h-full w-full"
          data-tour="aside-files-tab"
        >
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
      </hlm-resizable-panel>

      <hlm-resizable-handle [class.hidden]="!bottomOpen()" />

      <!-- Bottom slot — has its own top toolbar (tabs + expand) and
           a content area below that. When collapsed, the panel
           shrinks to just the toolbar height. -->
      <hlm-resizable-panel
        #bottomPanel="hlmResizablePanel"
        [defaultSize]="50"
        [minSize]="6"
        [collapsible]="true"
        class="overflow-hidden"
      >
        <div class="flex h-full w-full flex-col">
          <!-- Top toolbar of the bottom slot. Always visible; the
               expand button toggles the content area below. -->
          <div
            class="flex h-9 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2"
            role="tablist"
            aria-label="Workspace processes"
          >
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="bottomOpen() && bottomTab() === 'setup'"
              (click)="onTabClick('setup')"
              class="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-brand/10 aria-selected:text-foreground"
            >
              Setup
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="bottomOpen() && bottomTab() === 'run'"
              (click)="onTabClick('run')"
              class="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-brand/10 aria-selected:text-foreground"
            >
              Run
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="bottomOpen() && bottomTab() === 'terminal'"
              (click)="onTabClick('terminal')"
              class="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-selected:bg-brand/10 aria-selected:text-foreground"
            >
              Terminal
            </button>
            <span class="flex-1"></span>
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              [hlmTooltip]="bottomOpen() ? 'Collapse panel' : 'Expand panel'"
              position="top"
              class="size-7 rounded-md text-muted-foreground"
              [attr.aria-expanded]="bottomOpen()"
              (click)="toggleBottomSlot()"
            >
              <ng-icon
                hlm
                [name]="bottomOpen() ? 'lucideChevronDown' : 'lucideChevronUp'"
                size="xs"
              />
            </button>
          </div>

          <!-- Content area — gone when collapsed; the panel shrinks to
               just the tab bar's height. -->
          @if (bottomOpen()) {
            <div class="min-h-0 flex-1 overflow-hidden">
              @switch (bottomTab()) {
                @case ('setup') {
                  <div class="p-4 text-sm text-muted-foreground">
                    <p class="font-medium text-foreground">Setup</p>
                    <p class="mt-1">
                      Workspace setup steps — package install, run
                      command, environment — land here.
                    </p>
                  </div>
                }
                @case ('run') {
                  @defer (on immediate) {
                    <app-feature-workspace-run
                      class="block h-full w-full"
                      [workspaceId]="workspaceId()"
                      [active]="bottomTab() === 'run'"
                    />
                  } @placeholder {
                    <div class="p-4 text-xs text-muted-foreground">
                      Loading run panel…
                    </div>
                  }
                }
                @case ('terminal') {
                  @defer (on idle) {
                    <app-feature-workspace-terminal
                      class="block h-full w-full"
                      [workspaceId]="workspaceId()"
                      [active]="bottomTab() === 'terminal'"
                    />
                  } @placeholder {
                    <div class="p-4 text-xs text-muted-foreground">
                      Loading terminal…
                    </div>
                  }
                }
              }
            </div>
          }
        </div>
      </hlm-resizable-panel>
    </hlm-resizable-group>
  `,
})
export class FeatureWorkspaceAside {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // Reflects `?tab=...` from the URL; default `run` so the param can
  // stay absent in the canonical case.
  protected readonly bottomTab = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => coerceBottomTab(p.get('tab'))),
    ),
    { initialValue: DEFAULT_BOTTOM_TAB },
  );

  // Whether the bottom slot's content area is expanded. The tab bar
  // is always visible regardless. Session-scoped — not persisted.
  protected readonly bottomOpen = signal(true);

  protected readonly workspaceId = this.workspaces.activeId;

  // Path of the file whose diff is mounted in the bottom Files panel.
  // Cleared whenever the active workspace changes.
  protected readonly selectedPath = signal<string | null>(null);

  // Bumped on every FS-watcher ping. Both file-tree and file-diff
  // children consume this as an input → effects re-run and re-fetch.
  protected readonly watcherTick = signal(0);

  private readonly _bottomPanelRef =
    viewChild<HlmResizablePanel>('bottomPanel');

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

    // Drive the bottom-slot panel size from the open/closed signal.
    // `collapsible: true` on the panel lets us call setSize(0) to
    // fully hide it without losing the resizable group structure.
    effect(() => {
      const open = this.bottomOpen();
      const panel = this._bottomPanelRef();
      if (panel) {
        panel.setSize(open ? BOTTOM_OPEN_PERCENT : BOTTOM_COLLAPSED_PERCENT);
      }
    });
  }

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    this.selectedPath.set(node.path);
  }

  // Clicking a tab :
  //   - opens the bottom slot if it's collapsed
  //   - sets the URL `?tab=` to the new tab (or clears it for Run)
  protected onTabClick(tab: BottomTab): void {
    if (!this.bottomOpen()) {
      this.bottomOpen.set(true);
    }
    if (tab === this.bottomTab()) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === DEFAULT_BOTTOM_TAB ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected toggleBottomSlot(): void {
    this.bottomOpen.update((v) => !v);
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
