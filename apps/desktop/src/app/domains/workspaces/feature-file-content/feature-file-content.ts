import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideColumns2,
  lucideFileDiff,
  lucideFilePen,
} from '@ng-icons/lucide';
import { FeatureFileDiff } from '../../repositories';

type FileContentMode = 'edit' | 'diff';

/**
 * File-only content for the middle shell — projected into
 * `FeatureWorkspaceMiddle`'s `[middle-content]` slot when a file tab
 * is active.
 *
 * P1.3.C scaffolding only : the Edit pane is a placeholder for P2.1's
 * CodeMirror editor and the Split toggle is a placeholder for the
 * unified/split diff layout. Diff mode embeds the existing
 * `FeatureFileDiff` so the file-tab UX stays intact through the
 * refactor ; P2.1 will swap that embed for `@codemirror/merge`.
 */
@Component({
  selector: 'app-feature-file-content',
  imports: [
    HlmTabsImports,
    HlmButtonImports,
    HlmIconImports,
    NgIcon,
    FeatureFileDiff,
  ],
  providers: [
    provideIcons({ lucideFileDiff, lucideFilePen, lucideColumns2 }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <hlm-tabs
      class="flex min-h-0 flex-1 flex-col"
      [tab]="mode()"
      (tabActivated)="setMode($any($event))"
    >
      <!-- Toolbar : Edit / Diff tabs on the left, Split toggle on the
           right (visible only in Diff mode). The toggle is a stub
           placeholder — P2.1 wires it to the actual diff layout. -->
      <div
        class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2"
      >
        <hlm-tabs-list
          variant="line"
          class="flex h-9 items-center gap-1"
          aria-label="File content mode"
        >
          <button
            hlmTabsTrigger="edit"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-3 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
          >
            <ng-icon hlm name="lucideFilePen" size="xs" />
            <span>Edit</span>
          </button>
          <button
            hlmTabsTrigger="diff"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-3 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
          >
            <ng-icon hlm name="lucideFileDiff" size="xs" />
            <span>Diff</span>
          </button>
        </hlm-tabs-list>

        @if (mode() === 'diff') {
          <button
            type="button"
            hlmBtn
            variant="ghost"
            size="icon-xs"
            class="size-7 text-muted-foreground"
            [attr.aria-pressed]="splitDiff()"
            [attr.aria-label]="splitDiff() ? 'Unified diff' : 'Split diff'"
            (click)="toggleSplit()"
          >
            <ng-icon hlm name="lucideColumns2" size="xs" />
          </button>
        }
      </div>

      <!-- Edit pane — pure placeholder. P2.1 fills it with CodeMirror. -->
      <div hlmTabsContent="edit" class="flex min-h-0 flex-1 flex-col">
        <div
          class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
        >
          <div class="text-center">
            <p class="font-medium">Edit mode</p>
            <p class="mt-1 text-xs">
              Coming in P2.1 — {{ filePath() ?? 'no file' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Diff pane — embeds the existing file-diff view so the file
           tab UX stays functional through the refactor. -->
      <div hlmTabsContent="diff" class="flex min-h-0 flex-1 flex-col">
        <app-feature-file-diff
          class="flex-1 min-h-0"
          [workspaceId]="workspaceId()"
          [path]="filePath()"
        />
      </div>
    </hlm-tabs>
  `,
})
export class FeatureFileContent {
  readonly workspaceId = input<string | null>(null);
  readonly filePath = input<string | null>(null);

  protected readonly mode = signal<FileContentMode>('diff');
  protected readonly splitDiff = signal(false);

  protected setMode(value: string): void {
    if (value !== 'edit' && value !== 'diff') return;
    this.mode.set(value);
  }

  protected toggleSplit(): void {
    this.splitDiff.update((v) => !v);
  }
}
