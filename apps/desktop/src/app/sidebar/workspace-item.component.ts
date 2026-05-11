/**
 * `WorkspaceItemComponent` — one row inside a project's expanded group.
 *
 * Layout (per DESIGN.md sidebar interaction patterns):
 *   - 8 px status dot in `--status-*` keyed off `workspace.status`.
 *   - Primary 14 px sans label = `tasks.byId().get(workspace.task_id)?.title`.
 *     Falls back to `(loading…)` while the task store is mid-fetch.
 *   - 12 px mono subtitle = `workspace.branch_name` (the only place that
 *     value is allowed to reach user-visible copy in v0.0.1).
 *   - Archive action deferred to plan 11; no per-row hover affordance in v0.0.1.
 *
 * Selection: clicking the row writes `workspace_id` into
 * `WorkspaceStore.select()`. The `[class.selected]` binding paints a
 * 2 px left accent + `--bg-selected` background.
 *
 * Context menu: right-click is intercepted to suppress the default
 * browser menu so plan 11 can wire the real cdk-overlay menu without
 * a v0.0.1 regression. No action fires for now.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
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
  imports: [HlmButtonImports],
  template: `
    <button
      hlmBtn
      variant="ghost"
      type="button"
      class="row"
      [class.selected]="isSelected()"
      [attr.aria-pressed]="isSelected()"
      (click)="select()"
      (contextmenu)="onContext($event)"
    >
      <span
        class="status-dot"
        [style.background-color]="statusColor()"
        aria-hidden="true"
      ></span>
      <span class="labels">
        <span class="title">{{ taskTitle() }}</span>
        <span class="subtitle">{{ workspace().branch_name }}</span>
      </span>
    </button>
  `,
  styles: `
    :host { display: block; }
    .row {
      display: grid;
      grid-template-columns: 8px 1fr;
      gap: 8px;
      align-items: center;
      width: 100%;
      padding: 6px 12px;
      background: transparent;
      border: 0;
      border-left: 2px solid transparent;
      text-align: left;
      cursor: pointer;
      color: inherit;
      font-family: var(--font-sans);
    }
    .row:hover { background: var(--bg-hover); }
    .row.selected {
      background: var(--bg-selected);
      border-left-color: var(--status-running);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-pill);
    }
    .labels {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      font-size: 14px;
      color: hsl(var(--foreground));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subtitle {
      font-size: 12px;
      font-family: var(--font-mono);
      color: hsl(var(--muted-foreground));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class WorkspaceItemComponent {
  readonly workspace = input.required<WorkspaceDto>();

  private readonly tasks = inject(TaskStore);
  private readonly store = inject(WorkspaceStore);

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

  onContext(event: MouseEvent): void {
    // Suppress the default browser context menu so plan 11 can attach a
    // cdk-overlay menu without inheriting v0.0.1 quirks. No action fires
    // for the v0.0.1 milestone.
    event.preventDefault();
  }
}
