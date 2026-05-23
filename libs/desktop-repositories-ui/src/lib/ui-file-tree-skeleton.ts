import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmSkeletonImports } from '@mozart/ui/skeleton';

// Pure-presentational placeholder for `feature-file-tree`. Renders
// seven shimmer rows of varied width so the eye reads "a list is
// loading" instead of "the previous workspace's tree is still here".
// Widths are intentionally hard-coded (not random per-render) — random
// widths would shift on every change-detection pass and create a
// jittery shimmer. The mix below was eyeballed against typical
// project trees.
const ROW_WIDTHS = ['78%', '52%', '88%', '34%', '64%', '92%', '46%'];

@Component({
  selector: 'app-file-tree-skeleton',
  imports: [...HlmSkeletonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true', role: 'status' },
  template: `
    <div class="flex flex-col gap-1 px-1 py-1.5">
      @for (width of widths; track $index) {
        <hlm-skeleton class="h-4" [style.width]="width" />
      }
    </div>
  `,
})
export class UiFileTreeSkeleton {
  protected readonly widths = ROW_WIDTHS;
}
