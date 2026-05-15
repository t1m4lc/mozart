import { CdkTreeModule, NestedTreeControl } from '@angular/cdk/tree';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff, lucideRefreshCw } from '@ng-icons/lucide';
import type { FileNode } from '../data/file-node.model';
import { RepositoriesFacade } from '../data/repositories.facade';
import { FileTreeRow } from '../ui-file-tree-row/ui-file-tree-row';

@Component({
  selector: 'app-feature-file-tree',
  imports: [
    NgIcon,
    CdkTreeModule,
    FileTreeRow,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucideEye, lucideEyeOff, lucideRefreshCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-sidebar' },
  template: `
    <div
      class="flex h-8 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
    >
      <span class="text-[11px] font-medium text-muted-foreground">Files</span>
      <span class="flex-1"></span>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="size-6 text-muted-foreground"
        [hlmTooltip]="
          showIgnored() ? 'Hide ignored files' : 'Show ignored files'
        "
        position="left"
        (click)="toggleIgnored()"
      >
        <ng-icon
          hlm
          [name]="showIgnored() ? 'lucideEye' : 'lucideEyeOff'"
          size="xs"
        />
      </button>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="size-6 text-muted-foreground"
        hlmTooltip="Refresh"
        position="left"
        (click)="reload()"
        [disabled]="loading()"
      >
        <ng-icon hlm name="lucideRefreshCw" size="xs" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-1 py-1">
      @if (loading() && nodes().length === 0) {
        <p class="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
      } @else if (error(); as err) {
        <p class="px-2 py-3 text-xs text-destructive">Failed to load: {{ err }}</p>
      } @else if (nodes().length === 0) {
        <p class="px-2 py-3 text-xs text-muted-foreground">
          No files yet.
        </p>
      } @else {
        <cdk-tree [dataSource]="nodes()" [treeControl]="treeControl">
          <cdk-tree-node *cdkTreeNodeDef="let node">
            <app-file-tree-row
              [node]="node"
              [isFolder]="false"
              (fileClick)="onFileClick($event)"
            />
          </cdk-tree-node>

          <cdk-nested-tree-node *cdkTreeNodeDef="let node; when: isDirectory">
            <app-file-tree-row
              [node]="node"
              [isFolder]="true"
              [expanded]="treeControl.isExpanded(node)"
              (folderToggle)="treeControl.toggle($event)"
            />
            <div
              class="ml-3 border-l border-border/50 pl-1"
              [class.hidden]="!treeControl.isExpanded(node)"
            >
              <ng-container cdkTreeNodeOutlet />
            </div>
          </cdk-nested-tree-node>
        </cdk-tree>
      }
    </div>
  `,
})
export class FeatureFileTree {
  readonly workspaceId = input<string | null>(null);
  readonly fileSelected = output<FileNode>();

  private readonly repos = inject(RepositoriesFacade);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly nodes = signal<FileNode[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showIgnored = signal(false);

  // CdkTree's NestedTreeControl wants `T[]`, not `readonly T[]`. The
  // model exposes `children` as readonly to discourage mutation, so we
  // copy on access.
  protected readonly treeControl = new NestedTreeControl<FileNode>((n) =>
    n.children ? [...n.children] : [],
  );

  /** CdkTree predicate: true when the node renders as a folder. */
  protected readonly isDirectory = (_index: number, node: FileNode): boolean =>
    node.kind === 'directory';

  // The currently-active watcher unsubscribe, if any. Replaced when
  // workspaceId changes, called on destroy.
  private currentUnwatch: (() => void) | null = null;

  constructor() {
    effect((onCleanup) => {
      const id = this.workspaceId();
      const showIgn = this.showIgnored();
      if (!id) {
        this.nodes.set([]);
        this.detachWatcher();
        return;
      }
      void this.fetch(id, showIgn);
      void this.attachWatcher(id, showIgn);
      onCleanup(() => this.detachWatcher());
    });

    this.destroyRef.onDestroy(() => this.detachWatcher());
  }

  protected toggleIgnored(): void {
    this.showIgnored.update((v) => !v);
  }

  protected reload(): void {
    const id = this.workspaceId();
    if (!id) return;
    void this.fetch(id, this.showIgnored());
  }

  protected onFileClick(node: FileNode): void {
    this.fileSelected.emit(node);
  }

  private async fetch(workspaceId: string, showIgnored: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const tree = await this.repos.loadTree(workspaceId, showIgnored);
      this.nodes.set([...tree]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
      this.nodes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async attachWatcher(
    workspaceId: string,
    showIgnored: boolean,
  ): Promise<void> {
    // Drop any prior subscription before opening a new one. The Rust
    // registry already replaces by workspaceId, but the unsubscribe
    // also clears the JS-side onmessage handler.
    this.detachWatcher();
    try {
      const unwatch = await this.repos.watch(workspaceId, () => {
        // Re-fetch with the *current* showIgnored, not the captured one
        // — toggling between pings should still take effect.
        if (this.workspaceId() === workspaceId) {
          void this.fetch(workspaceId, this.showIgnored());
        }
      });
      // If the workspace changed (or component destroyed) while we were
      // awaiting, immediately tear down the just-attached subscription.
      if (this.workspaceId() !== workspaceId) {
        try {
          unwatch();
        } catch (e) {
          console.warn('[file-tree] late unwatch failed:', e);
        }
        return;
      }
      this.currentUnwatch = unwatch;
    } catch (err) {
      // Watcher failure shouldn't block the tree — log and carry on.
      console.warn('[file-tree] watch failed:', err);
    }
    // Suppress unused-parameter lint when showIgnored is captured only
    // by the closure above (kept in the signature to make the dataflow
    // explicit at the call site).
    void showIgnored;
  }

  private detachWatcher(): void {
    const fn = this.currentUnwatch;
    this.currentUnwatch = null;
    if (!fn) return;
    try {
      fn();
    } catch (e) {
      console.warn('[file-tree] unwatch failed:', e);
    }
  }
}
