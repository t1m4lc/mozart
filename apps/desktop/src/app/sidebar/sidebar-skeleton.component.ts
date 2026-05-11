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
  template: `
    <div class="list" aria-hidden="true">
      <div class="row"></div>
      <div class="row"></div>
      <div class="row"></div>
    </div>
  `,
  styles: `
    :host { display: block; padding: 12px; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row {
      height: 28px;
      border-radius: var(--radius-sm);
      background: hsl(var(--card));
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
