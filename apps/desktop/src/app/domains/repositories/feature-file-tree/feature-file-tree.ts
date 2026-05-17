import { CdkTreeModule } from '@angular/cdk/tree';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmSkeletonImports } from '@mozart/ui/skeleton';
import type { FileNode } from '../data/file-node.model';
import { RepositoriesFacade } from '../data/repositories.facade';
import { FileTreeRow } from '../ui-file-tree-row/ui-file-tree-row';

// CdkTree migration note (perf-backlog): we use `childrenAccessor` +
// internal expansion state rather than the deprecated `treeControl`.
// `childrenAccessor` is the new public API as of Angular CDK 17+; the
// component owns expansion state via a Set<path> so the template can
// query / toggle without instantiating a TreeControl.
@Component({
  selector: 'app-feature-file-tree',
  imports: [CdkTreeModule, FileTreeRow, ...HlmSkeletonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <div class="min-h-0 flex-1 overflow-auto px-0 py-1">
      @if (loading() && nodes().length === 0) {
        <div class="flex flex-col gap-1 px-1 py-1.5" aria-busy="true">
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <hlm-skeleton class="h-4 w-full" />
          }
        </div>
      } @else if (error(); as err) {
        <p class="px-2 py-3 text-xs text-destructive">
          Failed to load: {{ err }}
        </p>
      } @else if (nodes().length === 0) {
        <p class="px-2 py-3 text-xs text-muted-foreground">No files yet.</p>
      } @else {
        <cdk-tree [dataSource]="nodes()" [childrenAccessor]="childrenAccessor">
          <cdk-tree-node *cdkTreeNodeDef="let node">
            <app-file-tree-row
              [node]="node"
              [isFolder]="false"
              [active]="activePath() === node.path"
              (fileClick)="onFileClick($event)"
            />
          </cdk-tree-node>

          <cdk-nested-tree-node *cdkTreeNodeDef="let node; when: isDirectory">
            <app-file-tree-row
              [node]="node"
              [isFolder]="true"
              [expanded]="isExpanded(node)"
              (folderToggle)="toggle(node)"
            />
            <div
              class="ml-3 border-l border-border/50 pl-1"
              [class.hidden]="!isExpanded(node)"
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
  /** Bumped by the parent on FS-watcher pings; triggers a re-fetch
   *  even when workspaceId / showIgnored stay the same. The aside owns
   *  the single watcher subscription per workspace. */
  readonly refreshTick = input<number>(0);
  /** Path of the file currently active in the central shell — rows
   *  matching this path render with brand tint. */
  readonly activePath = input<string | null>(null);
  readonly fileSelected = output<FileNode>();

  private readonly repos = inject(RepositoriesFacade);

  protected readonly nodes = signal<FileNode[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  // Ignored files (gitignored, etc.) stay hidden in the polished UI.
  // The toggle was dropped with the file-tree toolbar in item 20.
  private readonly showIgnored = false;

  // Expansion state keyed by node.path. CdkTree's new childrenAccessor
  // API leaves expansion to the consumer ; we re-implement the same
  // toggle semantics here with a signal so OnPush re-renders kick in.
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Children accessor for CdkTree. Copies because the model exposes
   *  `children` as readonly and CdkTree expects `T[]`. */
  protected readonly childrenAccessor = (node: FileNode): FileNode[] =>
    node.children ? [...node.children] : [];

  /** CdkTree predicate: true when the node renders as a folder. */
  protected readonly isDirectory = (_index: number, node: FileNode): boolean =>
    node.kind === 'directory';

  protected isExpanded(node: FileNode): boolean {
    return this.expanded().has(node.path);
  }

  protected toggle(node: FileNode): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      // Subscribe to the tick so each watcher ping forces a re-fetch.
      this.refreshTick();
      if (!id) {
        this.nodes.set([]);
        this.expanded.set(new Set());
        return;
      }
      void this.fetch(id, this.showIgnored);
    });
  }

  protected onFileClick(node: FileNode): void {
    this.fileSelected.emit(node);
  }

  private async fetch(
    workspaceId: string,
    showIgnored: boolean,
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const tree = await this.repos.loadTree(workspaceId, showIgnored);
      // Rapid workspace clicks fire multiple in-flight fetches; only
      // apply the response if it matches the currently-active id.
      // Without this guard the tree could flash older workspaces.
      if (this.workspaceId() !== workspaceId) return;
      this.nodes.set([...tree]);
    } catch (err) {
      if (this.workspaceId() !== workspaceId) return;
      this.error.set(err instanceof Error ? err.message : String(err));
      this.nodes.set([]);
    } finally {
      if (this.workspaceId() === workspaceId) {
        this.loading.set(false);
      }
    }
  }
}
