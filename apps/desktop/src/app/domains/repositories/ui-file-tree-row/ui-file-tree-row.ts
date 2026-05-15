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
      class="flex h-7 w-full items-center gap-1 rounded px-2 text-left text-xs hover:bg-muted/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
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
      @if (badge(); as b) {
        <span
          hlmBadge
          [variant]="b.variant"
          class="ml-auto h-4 px-1.5 py-0 text-[10px] font-medium leading-none"
          [attr.aria-label]="b.label"
          [title]="b.label"
        >{{ b.letter }}</span>
      }
    </button>
  `,
})
export class FileTreeRow {
  readonly node = input.required<FileNode>();
  readonly isFolder = input<boolean>(false);
  readonly expanded = input<boolean>(false);

  readonly fileClick = output<FileNode>();
  readonly folderToggle = output<FileNode>();

  protected readonly badge = computed(() => statusBadge(this.node().status));

  protected onClick(): void {
    if (this.isFolder()) {
      this.folderToggle.emit(this.node());
    } else {
      this.fileClick.emit(this.node());
    }
  }
}
