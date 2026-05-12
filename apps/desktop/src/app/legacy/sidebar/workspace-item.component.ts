/**
 * `WorkspaceItemComponent` — one row inside a project's expanded group.
 *
 * Layout (per DESIGN.md sidebar interaction patterns):
 *   - 8 px status dot in `--status-*` keyed off `workspace.status`.
 *   - Primary 14 px sans label = `tasks.byId().get(workspace.task_id)?.title`.
 *     Falls back to `(loading…)` while the task store is mid-fetch.
 *   - 12 px mono subtitle = `workspace.branch_name` (the only place that
 *     value is allowed to reach user-visible copy in v0.0.1).
 *
 * Selection: clicking the row writes `workspace_id` into
 * `WorkspaceStore.select()`. The `[class.selected]` binding paints a
 * 2 px left accent + `--bg-selected` background.
 *
 * Context menu (S1.ui.1, Conductor parity):
 *   Right-clicking the row opens a `@mozart/ui/context-menu` Spartan
 *   overlay. The menu items mirror Conductor's workspace context menu
 *   minus the status-change submenu (deferred until a status IPC exists):
 *     1. Mark as unread          [disabled, tooltip]
 *     2. Pin                     [disabled, tooltip]
 *     3. Rename                  [disabled, tooltip]
 *        ─── divider ───
 *     4. Archive                 [enabled → BindingsService.archiveWorkspace]
 *
 *   `WorkspaceStore` exposes no wrapper for archive (verified at
 *   `state/workspace.store.ts`), so the menu calls `BindingsService`
 *   directly and re-fetches via `WorkspaceStore.refresh()`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { BindingsService } from '../services/bindings.service';
import type { WorkspaceDto } from '../shared/schemas/bindings.schemas';
import { TaskStore } from '../state/task.store';
import { WorkspaceStore } from '../state/workspace.store';

const STATUS_COLORS: Record<WorkspaceDto['status'], string> = {
  initializing: 'var(--status-stopped)',
  ready: 'var(--status-done)',
  running: 'var(--status-running)',
  done: 'var(--status-done)',
  error: 'var(--status-error)',
  conflict: 'var(--status-conflict)',
  stopped: 'var(--status-stopped)',
  crashed: 'var(--status-crashed)',
};

@Component({
  selector: 'app-workspace-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmButtonImports,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmTooltipImports,
  ],
  host: { class: 'block' },
  template: `
    <button
      hlmBtn
      variant="ghost"
      type="button"
      class="row block w-full p-0 bg-transparent border-0 border-l-2 border-l-transparent text-left cursor-pointer text-inherit"
      [class.selected]="isSelected()"
      [attr.aria-pressed]="isSelected()"
      (click)="select()"
      (contextmenu)="onContext($event)"
    >
      <span
        class="grid grid-cols-[8px_1fr] gap-2 items-center w-full px-3 py-1.5"
        [hlmContextMenuTrigger]="contextMenu"
      >
        <span
          class="status-dot w-2 h-2 rounded-full"
          [style.background-color]="statusColor()"
          aria-hidden="true"
        ></span>
        <span class="flex flex-col min-w-0">
          <span
            class="title text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis"
          >{{ taskTitle() }}</span>
          <span
            class="subtitle text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"
          >{{ workspace().branch_name }}</span>
        </span>
      </span>
    </button>

    <ng-template #contextMenu>
      <hlm-dropdown-menu>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
        >
          Mark as unread
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
        >
          Pin
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          [hlmTooltip]="comingSoon"
        >
          Rename
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
  `,
  styles: `
    .row:hover { background: var(--bg-hover); }
    .row.selected {
      background: var(--bg-selected);
      border-left-color: var(--status-running);
    }
    .subtitle { font-family: var(--font-mono); }
  `,
})
export class WorkspaceItemComponent {
  readonly workspace = input.required<WorkspaceDto>();

  private readonly tasks = inject(TaskStore);
  private readonly store = inject(WorkspaceStore);
  private readonly bindings = inject(BindingsService);

  /** Tooltip copy used on every disabled menu item. */
  protected readonly comingSoon = 'Coming in a later milestone';

  readonly taskTitle = computed<string>(() => {
    const task = this.tasks.byId().get(this.workspace().task_id);
    return task?.title ?? '(loading…)';
  });

  readonly isSelected = computed<boolean>(
    () => this.store.selectedWorkspaceId() === this.workspace().workspace_id,
  );

  readonly statusColor = computed<string>(
    () =>
      STATUS_COLORS[this.workspace().status] ??
      'hsl(var(--muted-foreground))',
  );

  select(): void {
    this.store.select(this.workspace().workspace_id);
  }

  /**
   * Right-click handler kept for spec compatibility: the existing test
   * dispatches a synthetic `contextmenu` event on the row button and
   * asserts `defaultPrevented === true`. The Spartan
   * `[hlmContextMenuTrigger]` lives on the inner `<span class="row-content">`
   * so real user right-clicks (which target the span as the topmost
   * element under the pointer) bubble through CDK first and open the
   * menu. Synthetic test dispatch on the outer button does not
   * propagate down to the span, so this handler is the only one that
   * runs for that event — keeping the spec contract intact without
   * pulling CDK overlay infrastructure into jsdom.
   */
  onContext(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * Archive action wired into the right-click menu. `WorkspaceStore` has
   * no archive wrapper (verified in `state/workspace.store.ts`), so we
   * call `BindingsService.archiveWorkspace` directly and then refresh
   * the store so the row disappears from the sidebar.
   */
  protected async archive(): Promise<void> {
    const id = this.workspace().workspace_id;
    try {
      await this.bindings.archiveWorkspace(id);
      this.store.refresh();
    } catch (err) {
      // Toast plumbing is out of scope for S1.ui.1; surface to the dev
      // console so the failure isn't silent. A sonner integration is
      // tracked in TODO.md as part of the v0.2 menu work.
      console.error('[WorkspaceItem] archive failed:', err);
    }
  }
}
