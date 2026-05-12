/**
 * `ProjectRowComponent` — collapsible project header + nested workspace
 * list. Membership of `ProjectStore.expandedProjectIds()` drives the
 * chevron + visibility of the workspace children.
 *
 * Per DESIGN.md sidebar interaction patterns:
 *   - Clicking the header toggles expansion (persisted to localStorage
 *     by `ProjectStore`'s `withStorageSync`).
 *   - Hover-revealed `[+]` button (S1.8b.5) opens
 *     `CreateWorkspaceDialog` locked to this project.
 *   - Hover-revealed `[⚙]` settings button is disabled with
 *     "Coming in 1.8d" tooltip (S1.8d wires it).
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
import { HlmCollapsibleImports } from '@mozart/ui/collapsible';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import type {
  RepoDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { CreateWorkspaceDialogComponent } from '../shell/create-workspace-dialog.component';
import { ProjectStore } from '../state/project.store';
import { WorkspaceStore } from '../state/workspace.store';
import { WorkspaceItemComponent } from './workspace-item.component';

@Component({
  selector: 'app-project-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButtonImports,
    HlmCollapsibleImports,
    HlmTooltipImports,
    WorkspaceItemComponent,
  ],
  template: `
    <hlm-collapsible class="group" [expanded]="isExpanded()">
      <button
        hlmBtn
        variant="ghost"
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
            class="new-workspace-btn"
            aria-label="New workspace in project"
            (click)="openNewWorkspace($event)"
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

      <hlm-collapsible-content class="children" role="group">
        @for (w of workspaces(); track w.workspace_id) {
          <app-workspace-item [workspace]="w" />
        } @empty {
          <p class="empty">No workspaces yet.</p>
        }
      </hlm-collapsible-content>
    </hlm-collapsible>
  `,
  styles: `
    :host { display: block; }
    hlm-collapsible.group { display: flex; flex-direction: column; }
    hlm-collapsible-content.children { display: flex; flex-direction: column; }
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
  private readonly dialog = inject(HlmDialogService);

  readonly isExpanded = computed<boolean>(() =>
    this.projects.expandedProjectIds().includes(this.project().repo_id),
  );

  readonly workspaces = computed<readonly WorkspaceDto[]>(() =>
    this.workspaceStore.workspacesForProject(this.project().repo_id),
  );

  toggle(): void {
    this.projects.toggleExpanded(this.project().repo_id);
  }

  /**
   * Open `CreateWorkspaceDialog` pre-locked to this project. We pass
   * `lockedRepoId` via the dialog context so the dialog can render the
   * project as read-only. The brain dialog service surfaces this
   * `context` via `injectBrnDialogContext`; the dialog component
   * picks the `lockedRepoId` field off the resulting object.
   *
   * `event.stopPropagation()` keeps the parent header row's
   * `(click)="toggle()"` from firing as a side effect.
   */
  protected openNewWorkspace(event: MouseEvent): void {
    event.stopPropagation();
    this.dialog.open(CreateWorkspaceDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
      context: { lockedRepoId: this.project().repo_id },
    });
  }
}
