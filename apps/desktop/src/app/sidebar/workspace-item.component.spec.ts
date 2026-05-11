import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import type {
  TaskDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { TaskStore } from '../state/task.store';
import { WorkspaceStore } from '../state/workspace.store';
import { WorkspaceItemComponent } from './workspace-item.component';

const taskA: TaskDto = {
  task_id: 't1',
  repo_id: 'r1',
  title: 'Refactor auth flow',
  task_text: 'detail',
  status: 'active',
  created_at: 1,
};

const workspaceReady: WorkspaceDto = {
  workspace_id: 'w1',
  task_id: 't1',
  worktree_path: '/tmp/demo/.worktrees/short1',
  branch_name: 'agent/wip-aaaaaa',
  base_branch: 'main',
  status: 'ready',
  created_at: 1,
  deletion_intent: 0,
};

const workspaceError: WorkspaceDto = {
  ...workspaceReady,
  workspace_id: 'w2',
  status: 'error',
};

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WorkspaceItemComponent],
  template: `<app-workspace-item [workspace]="workspace" />`,
})
class HostComponent {
  workspace: WorkspaceDto = workspaceReady;
}

function fakeBindings(): unknown {
  return {
    listRepos: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
    listWorkspaces: vi.fn(async () => []),
    addRepo: vi.fn(),
    archiveWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    listRuns: vi.fn(),
    getWorkspaceDiff: vi.fn(),
    discardWorkspaceChanges: vi.fn(),
    listBranches: vi.fn(),
    checkClaudeInstall: vi.fn(),
  };
}

function configure(): void {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      { provide: BindingsService, useValue: fakeBindings() },
    ],
  });
}

describe('WorkspaceItemComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders branch_name as the mono subtitle', () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const subtitle = fixture.nativeElement.querySelector('.subtitle');
    expect(subtitle?.textContent?.trim()).toBe('agent/wip-aaaaaa');
  });

  it('falls back to "(loading…)" when the task is not in the TaskStore', () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.title');
    expect(title?.textContent?.trim()).toBe('(loading…)');
  });

  it('renders tasks.title once it appears in TaskStore.byId()', async () => {
    configure();
    const tasks = TestBed.inject(TaskStore);
    // Seed the TaskStore via its public rxMethod by faking the binding.
    const bindings = TestBed.inject(BindingsService) as unknown as {
      listTasks: ReturnType<typeof vi.fn>;
    };
    bindings.listTasks.mockResolvedValueOnce([taskA]);
    tasks.refreshFor('r1');
    await new Promise((r) => setTimeout(r, 0));

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.title');
    expect(title?.textContent?.trim()).toBe('Refactor auth flow');
  });

  it('paints the status dot in --status-done for status=ready', () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dot = fixture.nativeElement.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toContain('--status-done');
  });

  it('paints the status dot in --status-error for status=error', () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.workspace = workspaceError;
    fixture.detectChanges();
    const dot = fixture.nativeElement.querySelector('.status-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toContain('--status-error');
  });

  it('clicking the row writes the workspace_id into WorkspaceStore.select', () => {
    configure();
    const store = TestBed.inject(WorkspaceStore);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.row') as HTMLButtonElement;
    row.click();
    fixture.detectChanges();
    expect(store.selectedWorkspaceId()).toBe('w1');
  });

  it('reflects selection via the .selected class', () => {
    configure();
    const store = TestBed.inject(WorkspaceStore);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    let row = fixture.nativeElement.querySelector('.row') as HTMLElement;
    expect(row.classList.contains('selected')).toBe(false);
    store.select('w1');
    fixture.detectChanges();
    row = fixture.nativeElement.querySelector('.row') as HTMLElement;
    expect(row.classList.contains('selected')).toBe(true);
  });

  it('suppresses the default browser context menu on right-click', () => {
    configure();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.row') as HTMLElement;
    const ev = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    row.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
