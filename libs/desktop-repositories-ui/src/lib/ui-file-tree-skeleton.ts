import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSkeletonImports } from '@spartan-ui/skeleton';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFile, lucideFolder } from '@ng-icons/lucide';

// Tree-shaped placeholder for `feature-file-tree`. Row shapes mirror
// `FileTreeRow` (chevron+folder for folders, w-3 spacer+file for files)
// so the eye reads "a tree is loading" and the layout doesn't shift
// when the real tree paints in. Widths are hard-coded (not random) to
// keep the shimmer stable across change-detection passes; randomizing
// per render would jitter on every tick. Glyphs render at low opacity
// so the pulsing label bars carry the loading signal.
const FOLDER_WIDTHS = ['64%', '46%', '72%'] as const;
const FILE_WIDTHS = ['58%', '82%', '38%', '70%', '52%', '88%'] as const;

@Component({
  selector: 'app-file-tree-skeleton',
  imports: [NgIcon, HlmIconImports, ...HlmSkeletonImports],
  providers: [
    provideIcons({ lucideChevronRight, lucideFile, lucideFolder }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true', role: 'status' },
  template: `
    <div class="flex flex-col gap-1 px-1 py-1.5">
      @for (width of folderWidths; track $index) {
        <div class="flex h-6 items-center gap-1 px-2">
          <ng-icon
            hlm
            name="lucideChevronRight"
            size="xs"
            class="shrink-0 text-muted-foreground/40"
          />
          <ng-icon
            hlm
            name="lucideFolder"
            size="xs"
            class="shrink-0 text-muted-foreground/40"
          />
          <hlm-skeleton class="h-3" [style.width]="width" />
        </div>
      }
      @for (width of fileWidths; track $index) {
        <div class="flex h-6 items-center gap-1">
          <span class="inline-block w-3"></span>
          <ng-icon
            hlm
            name="lucideFile"
            size="xs"
            class="shrink-0 text-muted-foreground/40"
          />
          <hlm-skeleton class="h-3" [style.width]="width" />
        </div>
      }
    </div>
  `,
})
export class UiFileTreeSkeleton {
  protected readonly folderWidths = FOLDER_WIDTHS;
  protected readonly fileWidths = FILE_WIDTHS;
}
