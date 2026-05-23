import { CdkTreeModule } from '@angular/cdk/tree';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { memoize } from '@mozart/desktop-core-util';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { FileTreeRow } from '@mozart/desktop-repositories-ui';
import { UiFileTreeSkeleton } from '@mozart/desktop-repositories-ui';

// CdkTree migration note (perf-backlog): we use `childrenAccessor` +
// internal expansion state rather than the deprecated `treeControl`.
// `childrenAccessor` is the new public API as of Angular CDK 17+; the
// component owns expansion state via a Set<path> so the template can
// query / toggle without instantiating a TreeControl.
//
// Loading behavior (P1.2):
//   - On workspace switch, the previous workspace's own tree is dropped
//     IMMEDIATELY so the eye never sees two workspaces' files mixed.
//   - If the FileTreeCache has a fresh entry for the new workspace
//     under the requested showIgnored, that tree renders instantly.
//   - Otherwise the most-recent fresh tree from any sibling workspace
//     of the same project is shown as a placeholder while the real
//     fetch is in flight. Sibling workspaces are branches of the same
//     repo and share ~99% of files, so the eye reads "approximately
//     correct, refreshing" instead of "empty page".
//   - Only when neither own-cache nor sibling-cache exists does the
//     skeleton placeholder render.
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
        <cdk-tree
          [dataSource]="nodes()"
          [childrenAccessor]="childrenAccessor"
          [trackBy]="trackByPath"
        >
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
            <!-- Only instantiate the children outlet when the folder
                 is expanded. The previous class.hidden variant left
                 every descendant row mounted in the DOM, which turned
                 a workspace switch into an O(file_count) synchronous
                 teardown of app-file-tree-row instances — the actual
                 blocking step the user perceives as a stall before
                 the route flips. With @if, collapsed folders cost
                 zero. Trade-off: expanding now mounts children on
                 demand (one-shot cost, hidden behind the user click). -->
            @if (isExpanded(node)) {
              <div class="ml-3 border-l border-border/50 pl-1">
                <ng-container cdkTreeNodeOutlet />
              </div>
            }
          </cdk-nested-tree-node>
        </cdk-tree>
      }
    </div>
  `,
})
export class FeatureFileTree {
  readonly workspaceId = input<string | null>(null);
  /** Project the workspace belongs to. Drives the project-level
   *  fallback tree shown during the brief fetch window when this
   *  workspace has never been opened before but a sibling has. */
  readonly projectId = input<string | null>(null);
  /** Path of the file currently active in the central shell — rows
   *  matching this path render with brand tint. */
  readonly activePath = input<string | null>(null);
  readonly fileSelected = output<FileNode>();

  private readonly repos = inject(RepositoriesFacade);
  private readonly uiState = inject(UiStateFacade);
  // Captured at construction so the fetch effect — whose callback
  // runs outside an injection context — can still schedule work via
  // `afterNextRender` (it requires an explicit injector then).
  private readonly injector = inject(Injector);

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

  // Sibling-workspace placeholder. Picks the freshest fresh tree from
  // any other workspace of the same project — branches of the same
  // repo are ~99% identical, so this gives the eye an approximately-
  // correct tree during the fetch window.
  private readonly projectFallbackTree = this.repos.projectFallbackTreeFor(
    this.workspaceId,
    this.projectId,
    this.showIgnored,
  );

  // Locally-fetched fallback for when neither cache has a hit. Stays
  // in sync with whatever was last written; reset to [] when
  // workspaceId changes so the previous tree never lingers on screen.
  private readonly localTree = linkedSignal<readonly FileNode[]>(() => {
    this.workspaceId();
    return [];
  });

  // CdkTree's `dataSource` is typed `T[]`, but we never mutate it —
  // the cache and local store are readonly. Returning the upstream
  // reference UNCHANGED (no spread) is the load-bearing optimization
  // for workspace switches: Angular's `computed` uses `Object.is`, so
  // a fresh `[...own]` every read would make CdkTree re-tear-down /
  // re-mount every row on every switch even when the underlying data
  // is identical. Casting away `readonly` is safe here — CdkTree
  // treats the array as a snapshot, never a mutable buffer.
  protected readonly nodes = computed<FileNode[]>(() => {
    const own = this.cachedTree();
    if (own) return own as FileNode[];
    const sibling = this.projectFallbackTree();
    if (sibling) return sibling as FileNode[];
    return this.localTree() as FileNode[];
  });

  protected readonly loading = linkedSignal<boolean>(() => {
    this.workspaceId();
    return false;
  });
  protected readonly error = linkedSignal<string | null>(() => {
    this.workspaceId();
    return null;
  });

  /** True when no tree at all is available yet (own cache empty AND
   *  no sibling fallback) AND a fetch is in flight. Sibling-tree hits
   *  short-circuit this so the user sees the placeholder instead. */
  protected readonly showSkeleton = computed(
    () =>
      this.cachedTree() === null &&
      this.projectFallbackTree() === null &&
      this.loading(),
  );

  // Expansion state keyed by node.path. CdkTree's `childrenAccessor`
  // API leaves expansion to the consumer; we persist the list of
  // expanded paths per workspace via UiStateStore so returning to a
  // previously-explored workspace restores the tree in the same
  // shape the user left it. The list is read reactively, so the
  // workspaceId input flip on navigation auto-flips this signal.
  private readonly expandedPaths = this.uiState.treeExpandedFor(
    this.workspaceId,
  );

  // Derived Set view for O(1) `.has()` checks in `isExpanded`.
  // Recomputed when `expandedPaths` changes.
  private readonly expandedSet = computed<ReadonlySet<string>>(
    () => new Set(this.expandedPaths()),
  );

  /** Children accessor for CdkTree. CdkTree calls this without
   *  binding, so we keep an arrow property as the public surface and
   *  delegate to a `@memoize()`-decorated method where `this` is the
   *  component — needed for the decorator's per-instance cache. */
  protected readonly childrenAccessor = (node: FileNode): FileNode[] =>
    this._childrenOf(node);

  /** Memoized spread of `node.children`. Spreading is required because
   *  the model exposes `children` as `readonly` while CdkTree's
   *  `dataSource` expects `FileNode[]`; with memoization the spread
   *  happens at most once per node identity per component instance
   *  (a tree refetch produces new FileNode objects → cache miss →
   *  re-spread; old node references are GC'd along with the WeakMap
   *  entry). Big win on workspace switches where CdkTree consults
   *  this for every visible folder.
   *
   *  References:
   *    - https://medium.com/@bansal.suneet/memo-decorator-with-angular-pipe-big-performance-boost-73f94b5c728a
   *    - https://angular.dev/best-practices/slow-computations */
  @memoize()
  private _childrenOf(node: FileNode): FileNode[] {
    return node.children ? [...node.children] : [];
  }

  /** CdkTree predicate: true when the node renders as a folder. */
  protected readonly isDirectory = (_index: number, node: FileNode): boolean =>
    node.kind === 'directory';

  /** Identity for CdkTree's IterableDiffer. Path is stable across
   *  workspaces of the same project (they're branches of the same
   *  repo), so switching between siblings only re-renders rows where
   *  the path actually differs — not every row. The biggest single
   *  perceived-latency win for workspace alternation. */
  protected readonly trackByPath = (_index: number, node: FileNode): string =>
    node.path;

  protected isExpanded(node: FileNode): boolean {
    return this.expandedSet().has(node.path);
  }

  protected toggle(node: FileNode): void {
    const id = this.workspaceId();
    if (!id) return;
    const next = new Set(this.expandedPaths());
    if (next.has(node.path)) next.delete(node.path);
    else next.add(node.path);
    this.uiState.setTreeExpanded(id, Array.from(next));
  }

  constructor() {
    // Fetch effect — fires on workspace switch / showIgnored toggle
    // when no fresh entry exists in the cache. The actual fetch is
    // deferred to `afterNextRender` so the workspace layout from the
    // navigation paints first; we re-check both guards inside the
    // hook because workspaceId can flip between the effect firing
    // and the next render (rapid workspace clicks).
    //
    // FS-watcher events do NOT route through this effect anymore;
    // they go through `RepositoriesFacade.refreshTreeInBackground`,
    // which writes a fresh tree on top of the existing cache entry
    // without invalidating it (no skeleton flash on every save).
    effect(() => {
      const id = this.workspaceId();
      const showIgnored = this.showIgnored();
      if (!id) return;
      if (this.cachedTree() !== null) return;
      afterNextRender(
        () => {
          if (this.workspaceId() !== id) return;
          if (this.cachedTree() !== null) return;
          void this.fetch(id, showIgnored);
        },
        { injector: this.injector },
      );
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
    // Capture the projectId at fetch-start. The cache uses it both for
    // the sibling-fallback lookup and to skip writes when the parent
    // forgot to supply one (defensive — the page binding does set it).
    const capturedProjectId = this.projectId();
    try {
      const tree = await this.repos.loadTree(workspaceId, showIgnored);
      // Rapid workspace clicks fire multiple in-flight fetches; only
      // apply the response if it matches the currently-active id.
      // Without this guard the tree could flash older workspaces.
      if (this.workspaceId() !== workspaceId) return;
      // Persist to the cache. The store discards the write silently
      // if a watcher event has bumped the revision since fetch start.
      if (capturedProjectId) {
        this.repos.cacheTree(
          workspaceId,
          capturedProjectId,
          tree,
          capturedRevision,
          showIgnored,
        );
      }
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
