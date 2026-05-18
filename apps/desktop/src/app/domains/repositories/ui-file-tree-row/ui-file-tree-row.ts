import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronRight,
  lucideFile,
  lucideFolder,
  lucideFolderOpen,
} from '@ng-icons/lucide';
import type { FileNode } from '../data/file-node.model';
import { statusBadge } from '../util-status-badge/util-status-badge';

@Component({
  selector: 'app-file-tree-row',
  imports: [NgIcon, HlmBadgeImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronRight,
      lucideFile,
      lucideFolder,
      lucideFolderOpen,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      [attr.aria-current]="active() ? 'true' : null"
      class="flex h-6 w-full items-center gap-1 rounded text-left text-xs hover:bg-muted/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 aria-[current=true]:bg-brand/15 aria-[current=true]:text-foreground"
      [class.opacity-50]="node().ignored"
      (click)="onClick()"
    >
      @if (isFolder()) {
        <ng-icon
          hlm
          [name]="expanded() ? 'lucideChevronDown' : 'lucideChevronRight'"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />
        <ng-icon
          hlm
          [name]="expanded() ? 'lucideFolderOpen' : 'lucideFolder'"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />
      } @else {
        <span class="inline-block w-3"></span>
        <ng-icon
          hlm
          name="lucideFile"
          size="xs"
          class="shrink-0 text-muted-foreground"
        />
      }
      <span class="min-w-0 flex-1 truncate">{{ node().name }}</span>
      @if (_hasDiff()) {
        <span
          class="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums"
        >
          @if ((node().added ?? 0) > 0) {
            <span class="text-emerald-600 dark:text-emerald-500"
              >+{{ node().added }}</span
            >
          }
          @if ((node().removed ?? 0) > 0) {
            <span class="text-red-600 dark:text-red-500"
              >−{{ node().removed }}</span
            >
          }
        </span>
      } @else if (badge(); as b) {
        <span
          hlmBadge
          [variant]="b.variant"
          class="ml-auto h-4 px-1.5 py-0 text-[10px] font-medium leading-none"
          [attr.aria-label]="b.label"
          [title]="b.label"
          >{{ b.letter }}</span
        >
      }
    </button>
  `,
})
export class FileTreeRow {
  readonly node = input.required<FileNode>();
  readonly isFolder = input<boolean>(false);
  readonly expanded = input<boolean>(false);
  // True when this row's path matches the currently-active file tab —
  // drives the brand-tint highlight on the selected file.
  readonly active = input<boolean>(false);

  readonly fileClick = output<FileNode>();
  readonly folderToggle = output<FileNode>();

  protected readonly badge = computed(() => statusBadge(this.node().status));
  // Render the +N/−N chip in place of the A/M/D badge for any file
  // that actually has line-level changes against the base branch.
  protected readonly _hasDiff = computed(() => {
    const n = this.node();
    return (n.added ?? 0) > 0 || (n.removed ?? 0) > 0;
  });

  protected onClick(): void {
    if (this.isFolder()) {
      this.folderToggle.emit(this.node());
    } else {
      this.fileClick.emit(this.node());
    }
  }
}
