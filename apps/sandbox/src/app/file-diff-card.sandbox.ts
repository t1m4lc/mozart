import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type FetchContextLines } from '@mozart-ui/diff-view';
import {
  MzFileDiffCard,
  type FileDiffStatus,
} from '@mozart-ui/file-diff-card';
import { HlmButtonImports } from '@spartan-ui/button';

interface LogEntry {
  readonly at: number;
  readonly source: string;
  readonly kind: string;
  readonly detail?: string;
}

interface StackedItem {
  readonly id: string;
  readonly path: string;
  readonly status: FileDiffStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly diff: string;
  readonly viewed: boolean;
}

// A short modified diff: 1 hunk, 1 add + 1 remove, surrounded by
// context. Used to populate the "happy path" cards.
const SHORT_DIFF = [
  'diff --git a/src/app/feature/foo.ts b/src/app/feature/foo.ts',
  '--- a/src/app/feature/foo.ts',
  '+++ b/src/app/feature/foo.ts',
  '@@ -10,5 +10,6 @@ function foo() {',
  '   const a = 1;',
  '   const b = 2;',
  '-  return a + b;',
  '+  const c = 3;',
  '+  return a + b + c;',
  ' }',
  ' ',
].join('\n');

// Multi-hunk diff for the long-diff card. Two separated hunks force
// two gaps in the rendered output; with fileLineCount + fetchContext
// supplied, the expand bars show up between/around them.
const LONG_DIFF = [
  'diff --git a/src/big.ts b/src/big.ts',
  '--- a/src/big.ts',
  '+++ b/src/big.ts',
  '@@ -10,4 +10,4 @@',
  ' ctx10',
  '-old11',
  '+new11',
  ' ctx12',
  '@@ -50,4 +50,5 @@',
  ' ctx50',
  '-old51',
  '+new51',
  '+inserted51a',
  ' ctx52',
].join('\n');

// Dev-only dogfooding surface for `MzFileDiffCard`. Renders every
// status branch alongside a long-diff variant with expand bars and a
// 5-card list so the "feed of files" visual story can be eyeballed.
@Component({
  selector: 'app-file-diff-card-sandbox',
  imports: [RouterLink, HlmButtonImports, MzFileDiffCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block p-8' },
  template: `
    <section class="mx-auto flex max-w-4xl flex-col gap-8">
      <header class="flex items-start justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="text-xl font-semibold">MzFileDiffCard</h1>
          <p class="text-muted-foreground text-sm">
            Every status branch + active / default-collapsed / rename /
            long-diff + a stacked list. Interactions log to the panel
            below so emissions are visible.
          </p>
        </div>
        <a hlmBtn variant="ghost" size="sm" routerLink="/"> ← Back </a>
      </header>

      <div class="flex flex-col gap-4">
        <p class="text-xs font-medium">Status: modified</p>
        <mz-file-diff-card
          path="src/app/feature/foo.ts"
          status="modified"
          [additions]="2"
          [deletions]="1"
          [diffText]="SHORT_DIFF"
          (refresh)="log('modified', 'refresh')"
          (pathCopy)="log('modified', 'pathCopy', $event)"
          (toggleCollapsed)="log('modified', 'toggle', String($event))"
        />

        <p class="text-xs font-medium">Status: added</p>
        <mz-file-diff-card
          path="src/app/new-file.ts"
          status="added"
          [additions]="42"
          [deletions]="0"
          [diffText]="SHORT_DIFF"
          (refresh)="log('added', 'refresh')"
        />

        <p class="text-xs font-medium">Status: deleted</p>
        <mz-file-diff-card
          path="src/app/old-file.ts"
          status="deleted"
          [additions]="0"
          [deletions]="17"
          [diffText]="SHORT_DIFF"
          (refresh)="log('deleted', 'refresh')"
        />

        <p class="text-xs font-medium">Status: renamed (with arrow)</p>
        <mz-file-diff-card
          path="src/app/new/path.ts"
          oldPath="src/old/path.ts"
          status="renamed"
          [additions]="3"
          [deletions]="2"
          [diffText]="SHORT_DIFF"
          (refresh)="log('renamed', 'refresh')"
        />

        <p class="text-xs font-medium">Status: binary</p>
        <mz-file-diff-card
          path="assets/logo.png"
          status="binary"
          (refresh)="log('binary', 'refresh')"
        />

        <p class="text-xs font-medium">Status: too-large (Show anyway)</p>
        <mz-file-diff-card
          path="dist/vendor.bundle.js"
          status="too-large"
          [additions]="5234"
          [deletions]="1892"
          (refresh)="log('too-large', 'refresh')"
          (showAnyway)="log('too-large', 'showAnyway')"
        />

        <p class="text-xs font-medium">Status: no-diff</p>
        <mz-file-diff-card
          path="src/app/unchanged.ts"
          status="no-diff"
          (refresh)="log('no-diff', 'refresh')"
        />

        <p class="text-xs font-medium">Variant: active = true</p>
        <mz-file-diff-card
          path="src/app/selected.ts"
          status="modified"
          [active]="true"
          [additions]="4"
          [deletions]="2"
          [diffText]="SHORT_DIFF"
        />

        <p class="text-xs font-medium">Variant: defaultCollapsed = true</p>
        <mz-file-diff-card
          path="src/app/collapsed.ts"
          status="modified"
          [defaultCollapsed]="true"
          [additions]="2"
          [deletions]="1"
          [diffText]="SHORT_DIFF"
        />

        <p class="text-xs font-medium">Variant: viewed = true (starts collapsed)</p>
        <mz-file-diff-card
          path="src/app/already-viewed.ts"
          status="modified"
          [viewed]="true"
          [defaultCollapsed]="true"
          [additions]="1"
          [deletions]="1"
          [diffText]="SHORT_DIFF"
          (viewedChange)="log('viewed-initial', 'viewedChange', String($event))"
        />

        <p class="text-xs font-medium">
          Long diff (2 hunks, expand bars; click ⤡ to reveal hidden lines)
        </p>
        <mz-file-diff-card
          path="src/big.ts"
          status="modified"
          [additions]="3"
          [deletions]="2"
          [diffText]="LONG_DIFF"
          [fetchContext]="fetchContext"
          [fileLineCount]="80"
          (refresh)="log('long-diff', 'refresh')"
        />

        <p class="text-xs font-medium">
          List of 5 cards (review-feed shape) — mark Viewed to move a
          card to the bottom; un-mark to move it back up
        </p>
        <div class="flex flex-col gap-2">
          @for (item of stackedFiles(); track item.id) {
            <mz-file-diff-card
              [path]="item.path"
              [status]="item.status"
              [additions]="item.additions"
              [deletions]="item.deletions"
              [diffText]="item.diff"
              [viewed]="item.viewed"
              [defaultCollapsed]="item.viewed"
              (pathCopy)="log('stack', 'pathCopy', $event)"
              (viewedChange)="onItemViewed(item.id, $event)"
            />
          }
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <p class="text-xs font-medium">Emitted events</p>
        <ul
          class="text-muted-foreground flex flex-col gap-1 font-mono text-[11px]"
        >
          @for (entry of events(); track entry.at) {
            <li>
              [{{ entry.source }}] {{ entry.kind
              }}{{ entry.detail ? ' = ' + entry.detail : '' }}
            </li>
          } @empty {
            <li class="italic">no events yet — try a copy, refresh, or toggle</li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class FileDiffCardSandbox {
  protected readonly SHORT_DIFF = SHORT_DIFF;
  protected readonly LONG_DIFF = LONG_DIFF;
  protected readonly String = String;
  protected readonly events = signal<readonly LogEntry[]>([]);

  // Signal-backed so `(viewedChange)` can reorder the array — viewed
  // items sink to the bottom, un-viewing brings the card back above the
  // viewed group. Relative order within each group is preserved.
  protected readonly stackedFiles = signal<readonly StackedItem[]>([
    {
      id: 's1',
      path: 'src/lib/router.ts',
      status: 'modified',
      additions: 7,
      deletions: 3,
      diff: SHORT_DIFF,
      viewed: false,
    },
    {
      id: 's2',
      path: 'src/lib/cache.ts',
      status: 'added',
      additions: 56,
      deletions: 0,
      diff: SHORT_DIFF,
      viewed: false,
    },
    {
      id: 's3',
      path: 'src/lib/legacy.ts',
      status: 'deleted',
      additions: 0,
      deletions: 124,
      diff: SHORT_DIFF,
      viewed: false,
    },
    {
      id: 's4',
      path: 'assets/sprite.svg',
      status: 'binary',
      additions: 0,
      deletions: 0,
      diff: '',
      viewed: false,
    },
    {
      id: 's5',
      path: 'src/lib/index.ts',
      status: 'no-diff',
      additions: 0,
      deletions: 0,
      diff: '',
      viewed: true,
    },
  ]);

  // Mock context-fetcher that returns synthetic line text. Lets the
  // long-diff card actually reveal expanded lines instead of erroring.
  protected readonly fetchContext: FetchContextLines = async (from, to) => {
    const out: string[] = [];
    for (let i = from; i <= to; i++) out.push(`line ${i} (synthesized)`);
    return out;
  };

  protected onItemViewed(id: string, viewed: boolean): void {
    this.stackedFiles.update((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, viewed } : i));
      const unviewed = updated.filter((i) => !i.viewed);
      const viewedItems = updated.filter((i) => i.viewed);
      return [...unviewed, ...viewedItems];
    });
    this.log('stack', 'viewedChange', `${id}=${viewed}`);
  }

  protected log(source: string, kind: string, detail?: string): void {
    const next: LogEntry = { at: Date.now(), source, kind, detail };
    this.events.update((prev) => [next, ...prev].slice(0, 12));
  }
}
