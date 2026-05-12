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
  host: { class: 'block' },
  template: `
    <hlm-collapsible class="flex flex-col" [expanded]="isExpanded()">
      <button
        hlmBtn
        variant="ghost"
        type="button"
        class="header grid grid-cols-[16px_1fr_auto] gap-1.5 items-center w-full px-3 py-1 bg-transparent border-0 text-left cursor-pointer text-foreground hover:bg-muted/40"
        [attr.aria-expanded]="isExpanded()"
        (click)="toggle()"
      >
        <span
          class="inline-flex items-center justify-center text-[10px] text-muted-foreground"
          aria-hidden="true"
        >
          {{ isExpanded() ? '▾' : '▸' }}
        </span>
        <span
          class="text-xs font-semibold uppercase tracking-[0.04em] whitespace-nowrap overflow-hidden text-ellipsis"
        >{{ project().display_name }}</span>
        <span
          class="header-actions inline-flex items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-in-out"
        >
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
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

      <hlm-collapsible-content class="flex flex-col" role="group">
        @for (w of workspaces(); track w.workspace_id) {
          <app-workspace-item [workspace]="w" />
        } @empty {
          <p class="m-0 pt-1.5 pr-3 pb-2 pl-[30px] text-xs text-muted-foreground">
            No workspaces yet.
          </p>
        }
      </hlm-collapsible-content>
    </hlm-collapsible>
  `,
  styles: `
    .header:hover .header-actions { opacity: 1; }
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
