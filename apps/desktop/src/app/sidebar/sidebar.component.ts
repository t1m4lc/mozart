/**
 * `SidebarComponent` — left navigation panel.
 *
 * Layout (per DESIGN.md):
 *   1. A `[≡][←][→][PROJECTS][+ Add]` nav strip across the top. All
 *      controls are disabled in v0.0.1 and carry tooltips naming the
 *      milestone unblocking them (`1.8d` / `0.2`).
 *   2. A scrollable region that switches between four states keyed off
 *      `withCallState`'s `projectsLoading()` / `projectsError()` and the
 *      length of `projects()`:
 *        - **Loading** → `<mozart-sidebar-skeleton>`.
 *        - **Error**   → `<mozart-sidebar-error>` with `[Retry]`.
 *        - **Empty**   → `<mozart-sidebar-empty>`.
 *        - **Populated** → one `<mozart-project-row>` per project.
 *
 * The scroll area uses a plain `overflow:auto` container for v0.0.1.
 * The Spartan `<ng-scrollbar hlm>` styling lives in
 * `libs/ui/scroll-area`, but the underlying `ngx-scrollbar` package is
 * not yet installed (atom 2 deliberately deferred the dep). Wiring the
 * custom scrollbar is a 1.8b follow-up that needs `pnpm add`.
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
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        disabled
        aria-label="Navigate back"
        [hlmTooltip]="'Coming in 0.2'"
      >
        &#8592;
      </button>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        disabled
        aria-label="Navigate forward"
        [hlmTooltip]="'Coming in 0.2'"
      >
        &#8594;
      </button>
      <span class="label">PROJECTS</span>
      <span class="spacer"></span>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        disabled
        aria-label="Add project"
        [hlmTooltip]="'Coming in 1.8d'"
      >
        +
      </button>
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
