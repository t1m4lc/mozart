import { CdkTreeModule } from '@angular/cdk/tree';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { FileNode } from '../data/file-node.model';
import { RepositoriesFacade } from '../data/repositories.facade';
import { FileTreeRow } from '../ui-file-tree-row/ui-file-tree-row';
import { UiFileTreeSkeleton } from '../ui-file-tree-skeleton/ui-file-tree-skeleton';

// CdkTree migration note (perf-backlog): we use `childrenAccessor` +
// internal expansion state rather than the deprecated `treeControl`.
// `childrenAccessor` is the new public API as of Angular CDK 17+; the
// component owns expansion state via a Set<path> so the template can
// query / toggle without instantiating a TreeControl.
//
// Loading behavior (P1.2):
//   - On workspace switch, the previous workspace's tree is dropped
//     IMMEDIATELY so the eye never sees two workspaces' files mixed.
//   - If the FileTreeCache has a fresh entry for the new workspace
//     under the requested showIgnored, that tree renders instantly.
//   - Otherwise a skeleton placeholder renders while the fetch is in
//     flight; the tree replaces it on resolution.
//   - Fetch resolutions race-checked against workspaceId AND the cache
//     revision captured at fetch start, so a watcher event mid-fetch
//     forces a retry rather than persisting stale data.
@Component({
  selector: 'app-feature-file-tree',
  imports: [CdkTreeModule, FileTreeRow, UiFileTreeSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <div class="min-h-0 flex-1 overflow-auto px-0 py-1">
      @if (showSkeleton()) {
        <app-file-tree-skeleton />
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
  /** Bumped by the parent on FS-watcher pings; the cache revision is
   *  the canonical invalidation signal but we still re-fetch on this
   *  tick so the in-flight loading UI feels responsive. The aside owns
   *  the single watcher subscription per workspace. */
  readonly refreshTick = input<number>(0);
  /** Path of the file currently active in the central shell — rows
   *  matching this path render with brand tint. */
  readonly activePath = input<string | null>(null);
  readonly fileSelected = output<FileNode>();

  private readonly repos = inject(RepositoriesFacade);

  // Ignored files (gitignored, etc.) stay hidden in the polished UI.
  // Wrapped in a signal so the cache accessor (which takes a Signal)
  // can read it reactively; the value itself is constant for now.
  protected readonly showIgnored = signal(false);

  // Cache-backed read of the latest tree for the active workspace.
  // Null while no entry exists or the entry is stale (FS-watcher event
  // since it was written).
  private readonly cachedTree = this.repos.cachedTreeFor(
    this.workspaceId,
    this.showIgnored,
  );

  // Locally-fetched fallback for when the cache is empty. Stays in
  // sync with whatever was last written; reset to [] when workspaceId
  // changes so the previous tree never lingers on screen.
  private readonly localTree = signal<readonly FileNode[]>([]);

  // CdkTree's `dataSource` insists on a mutable `T[]`; the cache and
  // local store are readonly, so we copy at the template-binding seam.
  // Cheap — the array is shallow and gets recreated only when the
  // upstream source actually changes.
  protected readonly nodes = computed<FileNode[]>(() => {
    const tree = this.cachedTree() ?? this.localTree();
    return [...tree];
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** True when nothing renderable is available yet and a fetch is in
   *  flight — i.e. first visit / post-invalidation. Cached cache-hits
   *  short-circuit this. */
  protected readonly showSkeleton = computed(
    () => this.nodes().length === 0 && this.loading(),
  );

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
    // Drop the previous workspace's local tree the instant the active
    // workspace id changes — keeps stale data from rendering during
    // the cross-fade. Cache hits for the new id will repopulate
    // `nodes()` via `cachedTree`; misses fall through to the fetch
    // effect below and the skeleton.
    effect(() => {
      const id = this.workspaceId();
      this.localTree.set([]);
      this.expanded.set(new Set());
      this.error.set(null);
      if (!id) this.loading.set(false);
    });

    // Fetch effect — runs when workspaceId / showIgnored / refreshTick
    // changes AND the cache currently has no fresh entry for that
    // combination. On resolve, writes to the cache so the next
    // workspace switch back here is instant.
    effect(() => {
      const id = this.workspaceId();
      const showIgnored = this.showIgnored();
      // Read refreshTick so each watcher ping retriggers the fetch
      // even when the cache invalidation hasn't yet been observed by
      // this effect (belt-and-braces; the cache flip is the canonical
      // signal but tick keeps the loading UI snappy).
      this.refreshTick();
      if (!id) return;
      if (this.cachedTree() !== null) return;
      void this.fetch(id, showIgnored);
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
    const capturedRevision = this.repos.treeRevisionFor(workspaceId);
    try {
      const tree = await this.repos.loadTree(workspaceId, showIgnored);
      // Rapid workspace clicks fire multiple in-flight fetches; only
      // apply the response if it matches the currently-active id.
      // Without this guard the tree could flash older workspaces.
      if (this.workspaceId() !== workspaceId) return;
      // Persist to the cache. The store discards the write silently
      // if a watcher event has bumped the revision since fetch start.
      this.repos.cacheTree(workspaceId, tree, capturedRevision, showIgnored);
      // Mirror into local fallback so the very first paint after a
      // long fetch still renders even before the cache signal
      // recomputes (which it will on the next tick).
      this.localTree.set([...tree]);
    } catch (err) {
      if (this.workspaceId() !== workspaceId) return;
      this.error.set(err instanceof Error ? err.message : String(err));
      this.localTree.set([]);
    } finally {
      if (this.workspaceId() === workspaceId) {
        this.loading.set(false);
      }
    }
  }
}
