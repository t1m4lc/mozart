/**
 * `SidebarComponent` — left navigation panel.
 *
 * Layout (per DESIGN.md + Conductor parity, S1.ui.1):
 *   1. A `[≡][PROJECTS][+ Add]` nav strip across the top. The hamburger
 *      "Toggle sidebar" affordance is disabled in v0.0.1 with a tooltip;
 *      the `+ Add` button opens the `<app-add-project-menu>` (post-1.8b
 *      refactor — native folder picker + future GitHub / Quick start
 *      placeholders).
 *
 *      Per Conductor parity Q1/Q2 (plan foamy-percolating-feather), the
 *      sidebar deliberately omits the recent-runs zone and any back /
 *      forward navigation buttons that Conductor ships above the project
 *      list.
 *   2. A scrollable region that switches between four states keyed off
 *      `withCallState`'s `projectsLoading()` / `projectsError()` and the
 *      length of `projects()`:
 *        - **Loading** → `<mozart-sidebar-skeleton>`.
 *        - **Error**   → `<mozart-sidebar-error>` with `[Retry]`.
 *        - **Empty**   → `<mozart-sidebar-empty>`.
 *        - **Populated** → one `<mozart-project-row>` per project.
 *
 * The scroll container is a plain `<div>` with `overflow:auto` for
 * v0.0.1 — the project list rarely exceeds a screen height. Spartan's
 * `@mozart/ui/scroll-area` is a styling directive for `<ng-scrollbar>`
 * from the `ngx-scrollbar` package; adopting it would require adding
 * that dependency. Not worth it for a list this small.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { MozartError } from '../services/mozart-error';
import { ProjectStore } from '../state/project.store';
import { AddProjectMenuComponent } from './add-project-menu.component';
import { ProjectRowComponent } from './project-row.component';
import { SidebarEmptyComponent } from './sidebar-empty.component';
import { SidebarErrorComponent } from './sidebar-error.component';
import { SidebarSkeletonComponent } from './sidebar-skeleton.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButtonImports,
    HlmTooltipImports,
    AddProjectMenuComponent,
    ProjectRowComponent,
    SidebarEmptyComponent,
    SidebarErrorComponent,
    SidebarSkeletonComponent,
  ],
  template: `
    <nav role="navigation" aria-label="Projects and workspaces" class="strip">
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        disabled
        aria-label="Toggle sidebar"
        [hlmTooltip]="'Coming in 0.2'"
      >
        &#9776;
      </button>
      <span class="label">PROJECTS</span>
      <span class="spacer"></span>
      <app-add-project-menu
        class="add-project-menu"
        variant="ghost"
        size="icon-xs"
        label="+"
        ariaLabel="Add project"
      />
    </nav>

    <div class="scroll">
      @if (projects.projectsLoading()) {
        <app-sidebar-skeleton />
      } @else if (projects.projectsError()) {
        <app-sidebar-error
          [error]="errorOrFallback()"
          (retry)="onRetry()"
        />
      } @else if (projects.projects().length === 0) {
        <app-sidebar-empty />
      } @else {
        @for (project of projects.projects(); track project.repo_id) {
          <app-project-row [project]="project" />
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      background: hsl(var(--sidebar));
      border-right: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .strip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      border-bottom: 1px solid hsl(var(--border));
      flex: 0 0 auto;
    }
    .label {
      margin-left: 4px;
      font-size: 11px;
      letter-spacing: 0.08em;
      color: hsl(var(--muted-foreground));
      text-transform: uppercase;
    }
    .spacer { flex: 1 1 auto; }
    .scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
  `,
})
export class SidebarComponent {
  protected readonly projects = inject(ProjectStore);

  /**
   * `withCallState` flips `projectsError()` truthy when the last refresh
   * rejected, but `errorDetail()` can theoretically still be null on
   * the first paint of that frame. Fall back to a synthetic
   * `MozartError` so `SidebarErrorComponent`'s `input.required<MozartError>()`
   * always has a value.
   */
  protected readonly errorOrFallback = computed<MozartError>(() =>
    this.projects.errorDetail() ??
    new MozartError('Db', 'Failed to load projects.'),
  );

  protected onRetry(): void {
    this.projects.refresh();
  }
}
