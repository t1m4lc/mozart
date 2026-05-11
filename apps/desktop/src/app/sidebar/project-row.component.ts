/**
 * `ProjectRowComponent` — collapsible project header + nested workspace
 * list. Membership of `ProjectStore.expandedProjectIds()` drives the
 * chevron + visibility of the workspace children.
 *
 * Per DESIGN.md sidebar interaction patterns:
 *   - Clicking the header toggles expansion (persisted to localStorage
 *     by `ProjectStore`'s `withStorageSync`).
 *   - Per-row disabled `[+]` (new workspace) + `[⚙]` (project settings)
 *     each carry a tooltip naming the milestone unblocking them.
 *   - Children come from
 *     `WorkspaceStore.workspacesForProject(project.repo_id)`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import type {
  RepoDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';
import { WorkspaceStore } from '../state/workspace.store';
import { WorkspaceItemComponent } from './workspace-item.component';

@Component({
  selector: 'app-project-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmTooltipImports, WorkspaceItemComponent],
  template: `
    <div class="group">
      <button
        type="button"
        class="header"
        [attr.aria-expanded]="isExpanded()"
        (click)="toggle()"
      >
        <span class="chevron" aria-hidden="true">
          {{ isExpanded() ? '▾' : '▸' }}
        </span>
        <span class="name">{{ project().display_name }}</span>
        <span class="header-actions">
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            disabled
            aria-label="New workspace in project"
            [hlmTooltip]="'Coming in 1.8d'"
          >
            +
          </button>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            disabled
            aria-label="Project settings"
            [hlmTooltip]="'Coming in 1.8d'"
          >
            &#9881;
          </button>
        </span>
      </button>

      @if (isExpanded()) {
        <div class="children" role="group">
          @for (w of workspaces(); track w.workspace_id) {
            <app-workspace-item [workspace]="w" />
          } @empty {
            <p class="empty">No workspaces yet.</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .group { display: flex; flex-direction: column; }
    .header {
      display: grid;
      grid-template-columns: 16px 1fr auto;
      gap: 6px;
      align-items: center;
      width: 100%;
      padding: 4px 12px;
      background: transparent;
      border: 0;
      text-align: left;
      cursor: pointer;
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .header:hover { background: hsl(var(--muted) / 0.4); }
    .chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: hsl(var(--muted-foreground));
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-actions {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
    }
    .header:hover .header-actions { opacity: 1; }
    .children { display: flex; flex-direction: column; }
    .empty {
      margin: 0;
      padding: 6px 12px 8px 30px;
      font-family: var(--font-sans);
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class ProjectRowComponent {
  readonly project = input.required<RepoDto>();

  private readonly projects = inject(ProjectStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  readonly isExpanded = computed<boolean>(() =>
    this.projects.expandedProjectIds().includes(this.project().repo_id),
  );

  readonly workspaces = computed<readonly WorkspaceDto[]>(() =>
    this.workspaceStore.workspacesForProject(this.project().repo_id),
  );

  toggle(): void {
    this.projects.toggleExpanded(this.project().repo_id);
  }
}
