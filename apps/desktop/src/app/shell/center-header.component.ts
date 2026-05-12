/**
 * `CenterHeaderComponent` — CENTER segment of the 3-segment shell
 * header. Renders the two stacked rows that live above the chat panel.
 *
 * Layout:
 *   Row 1 (breadcrumb-row): `Project > Workspace [icon, tooltip]` on
 *     the left, a 3-dot actions menu trigger on the right.
 *   Row 2 (tabs-row):       one tab per workspace (v0.0.1 = exactly
 *     one), labelled with the workspace name (fallback: branch_name),
 *     plus a visibly-disabled `+` button with a "coming soon" tooltip.
 *
 * Conditional rendering: when no workspace is selected
 * (`WorkspaceStore.selectedWorkspace() === null`), the host renders
 * nothing — matching `ShellStore.centerView() === 'empty'` so the
 * header doesn't sit over an empty placeholder.
 *
 * Actions menu (`Commit / Discard / Archive`):
 *   - `Commit` is visibly disabled with a tooltip naming the milestone
 *     that unblocks it (DESIGN.md Rule 7).
 *   - `Discard` calls `BindingsService.discardWorkspaceChanges(id)` then
 *     `WorkspaceStore.refresh()` — mirrors the archive flow that S1.ui.1
 *     wired into the sidebar's right-click menu.
 *   - `Archive` calls `BindingsService.archiveWorkspace(id)` then
 *     `WorkspaceStore.refresh()`.
 *
 * Breadcrumb data sources:
 *   - Project name: `ProjectStore.projects()` looked up by
 *     `workspace.task_id → TaskStore → repo_id`. Since the center
 *     header is gated on a selected workspace, this lookup is always
 *     defined; we still fall back to a `—` placeholder defensively.
 *   - Workspace name: best-effort `task.title` (matches the sidebar
 *     row's primary label) with a `branch_name` fallback.
 *
 * The workspace icon next to the name carries a tooltip that exposes
 * `workspace.base_branch` — the only place in v0.0.1 user-visible copy
 * is allowed to surface the branch name. Wrapping it in a tooltip
 * keeps the breadcrumb itself free of git jargon.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideGitBranch,
  lucideMoreHorizontal,
  lucidePlus,
} from '@ng-icons/lucide';
import { HlmBreadcrumbImports } from '@mozart/ui/breadcrumb';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { BindingsService } from '../services/bindings.service';
import { ProjectStore } from '../state/project.store';
import { TaskStore } from '../state/task.store';
import { WorkspaceStore } from '../state/workspace.store';

@Component({
  selector: 'app-center-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmBreadcrumbImports,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmTabsImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({ lucideGitBranch, lucideMoreHorizontal, lucidePlus }),
  ],
  template: `
    @if (workspace(); as ws) {
      <header
        class="center-header"
        aria-label="Workspace location and tabs"
        data-tauri-drag-region
      >
        <div
          class="row breadcrumb-row"
          data-tauri-drag-region
        >
          <nav hlmBreadcrumb aria-label="Workspace location">
            <ol hlmBreadcrumbList>
              <li hlmBreadcrumbItem>
                <span class="crumb-project">{{ projectName() }}</span>
              </li>
              <li hlmBreadcrumbSeparator></li>
              <li hlmBreadcrumbItem>
                <span hlmBreadcrumbPage class="crumb-workspace">{{
                  workspaceLabel()
                }}</span>
                <span
                  class="ws-icon"
                  [hlmTooltip]="ws.base_branch"
                  data-tauri-drag-region="false"
                >
                  <ng-icon name="lucideGitBranch" class="ws-icon-svg" />
                </span>
              </li>
            </ol>
          </nav>
          <span class="spacer" data-tauri-drag-region></span>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="actions-trigger"
            aria-label="Workspace actions"
            data-tauri-drag-region="false"
            [hlmTooltip]="'Workspace actions'"
            [hlmDropdownMenuTrigger]="actionsMenu"
          >
            <ng-icon name="lucideMoreHorizontal" class="actions-icon" />
          </button>
          <ng-template #actionsMenu>
            <hlm-dropdown-menu>
              <button
                hlmDropdownMenuItem
                type="button"
                disabled
                [hlmTooltip]="commitComingSoon"
              >
                Commit
              </button>
              <button
                hlmDropdownMenuItem
                type="button"
                (click)="discard()"
              >
                Discard changes
              </button>
              <hlm-dropdown-menu-separator />
              <button
                hlmDropdownMenuItem
                type="button"
                (click)="archive()"
              >
                Archive
              </button>
            </hlm-dropdown-menu>
          </ng-template>
        </div>
        <div class="row tabs-row" data-tauri-drag-region>
          <hlm-tabs [tab]="activeTabId()" class="tabs">
            <hlm-tabs-list variant="line">
              <button
                [hlmTabsTrigger]="activeTabId()"
                type="button"
                class="tab-trigger"
                data-tauri-drag-region="false"
              >
                {{ workspaceLabel() }}
              </button>
            </hlm-tabs-list>
          </hlm-tabs>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            class="new-tab-btn"
            aria-label="New tab"
            disabled
            data-tauri-drag-region="false"
            [hlmTooltip]="newTabComingSoon"
          >
            <ng-icon name="lucidePlus" class="new-tab-icon" />
          </button>
          <span class="spacer" data-tauri-drag-region></span>
        </div>
      </header>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .center-header {
      display: grid;
      grid-template-rows: 32px 32px;
      height: 100%;
      background: hsl(var(--card));
      border-bottom: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      min-width: 0;
    }
    .breadcrumb-row {
      border-bottom: 1px solid hsl(var(--border));
    }
    .crumb-project {
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }
    .crumb-workspace {
      font-size: 13px;
      font-weight: 500;
    }
    .ws-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: hsl(var(--muted-foreground));
      cursor: default;
    }
    .ws-icon-svg {
      --ng-icon__size: 12px;
    }
    .spacer {
      flex: 1 1 auto;
    }
    /* hlmBtn variant="ghost" size="icon-xs" owns sizing + hover; we
       only tint icon color so the trigger blends into the header. */
    .actions-trigger {
      color: hsl(var(--muted-foreground));
    }
    .actions-trigger:hover {
      color: hsl(var(--foreground));
    }
    .actions-icon {
      --ng-icon__size: 14px;
    }
    .tabs {
      min-width: 0;
    }
    .tab-trigger {
      cursor: pointer;
    }
    .new-tab-btn {
      color: hsl(var(--muted-foreground));
    }
    .new-tab-icon {
      --ng-icon__size: 14px;
    }
  `,
})
export class CenterHeaderComponent {
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly projectStore = inject(ProjectStore);
  private readonly tasks = inject(TaskStore);
  private readonly bindings = inject(BindingsService);

  /** Tooltip copy on the disabled `+ New tab` button. */
  protected readonly newTabComingSoon =
    'Multi-chats coming in a later milestone';
  /** Tooltip copy on the disabled `Commit` menu item. */
  protected readonly commitComingSoon =
    'Commit IPC coming in a later milestone';

  /** The currently-selected workspace, or `null` when none is selected. */
  protected readonly workspace = computed(
    () => this.workspaceStore.selectedWorkspace(),
  );

  /** Repo (project) the active workspace belongs to. */
  private readonly project = computed(() => {
    const ws = this.workspace();
    if (!ws) return null;
    const task = this.tasks.byId().get(ws.task_id);
    if (!task) return null;
    return (
      this.projectStore
        .projects()
        .find((p) => p.repo_id === task.repo_id) ?? null
    );
  });

  protected readonly projectName = computed<string>(
    () => this.project()?.display_name ?? '—',
  );

  /**
   * Workspace label shown in the breadcrumb AND on the only tab. Best
   * effort: prefer the task title (matches the sidebar primary label),
   * fall back to `branch_name` (the workspace's only other stable
   * human-readable string).
   */
  protected readonly workspaceLabel = computed<string>(() => {
    const ws = this.workspace();
    if (!ws) return '';
    const task = this.tasks.byId().get(ws.task_id);
    return task?.title ?? ws.branch_name;
  });

  /** Single-tab id (v0.0.1 has exactly one chat per workspace). */
  protected readonly activeTabId = computed<string>(
    () => this.workspace()?.workspace_id ?? 'tab-0',
  );

  /**
   * Discard the workspace's uncommitted changes. Mirrors the archive
   * flow from `WorkspaceItemComponent` in S1.ui.1 — `WorkspaceStore`
   * has no wrapper, so we call `BindingsService` directly and refresh
   * the store so the UI re-flects post-discard state.
   */
  protected async discard(): Promise<void> {
    const ws = this.workspace();
    if (!ws) return;
    try {
      await this.bindings.discardWorkspaceChanges(ws.workspace_id);
      this.workspaceStore.refresh();
    } catch (err) {
      // Toast plumbing is tracked in TODO.md as part of the v0.2 menu
      // work; surface to the dev console so the failure isn't silent.
      console.error('[CenterHeader] discard failed:', err);
    }
  }

  /**
   * Archive the workspace. Same shape as `discard()` above — direct
   * IPC call followed by a store refresh so the sidebar row + center
   * header disappear from the UI.
   */
  protected async archive(): Promise<void> {
    const ws = this.workspace();
    if (!ws) return;
    try {
      await this.bindings.archiveWorkspace(ws.workspace_id);
      this.workspaceStore.refresh();
    } catch (err) {
      console.error('[CenterHeader] archive failed:', err);
    }
  }
}
