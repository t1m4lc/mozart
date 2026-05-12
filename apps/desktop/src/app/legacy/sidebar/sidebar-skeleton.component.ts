/**
 * `SidebarSkeletonComponent` — three placeholder rows shown while
 * `ProjectStore.projectsLoading()` is true. Renders a subtle shimmer by
 * animating the background between `--bg-card` and `--bg-hover` over
 * 1200ms; honours `@media (prefers-reduced-motion: reduce)` by holding
 * the resting background.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sidebar-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block p-3' },
  template: `
    <div class="flex flex-col gap-2" aria-hidden="true">
      <div class="row h-7 rounded-sm bg-card"></div>
      <div class="row h-7 rounded-sm bg-card"></div>
      <div class="row h-7 rounded-sm bg-card"></div>
    </div>
  `,
  styles: `
    .row {
      animation: shimmer 1200ms ease-in-out infinite;
    }
    @keyframes shimmer {
      0%, 100% { background: hsl(var(--card)); }
      50%      { background: var(--bg-hover); }
    }
    @media (prefers-reduced-motion: reduce) {
      .row { animation: none; }
    }
  `,
})
export class SidebarSkeletonComponent {}
