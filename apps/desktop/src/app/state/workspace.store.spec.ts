import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import type {
  RepoDto,
  TaskDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { ProjectStore } from './project.store';
import { TaskStore } from './task.store';
import { WorkspaceStore } from './workspace.store';

const repoA: RepoDto = {
  repo_id: 'rA',
  path: '/tmp/a',
  display_name: 'A',
  added_at: 1,
};

const taskA1: TaskDto = {
  task_id: 'tA1',
  repo_id: 'rA',
  title: 'A1',
  task_text: 'A1',
  status: 'active',
  created_at: 1,
};
const taskA2: TaskDto = {
  task_id: 'tA2',
  repo_id: 'rA',
  title: 'A2',
  task_text: 'A2',
  status: 'active',
  created_at: 2,
};

const wsA1a: WorkspaceDto = {
  workspace_id: 'wA1a',
  task_id: 'tA1',
  worktree_path: '/tmp/wA1a',
  branch_name: 'agent/wip-A1a',
  base_branch: 'main',
  status: 'ready',
  created_at: 1,
  deletion_intent: 0,
};
const wsA1b: WorkspaceDto = {
  workspace_id: 'wA1b',
  task_id: 'tA1',
  worktree_path: '/tmp/wA1b',
  branch_name: 'agent/wip-A1b',
  base_branch: 'main',
  status: 'running',
  created_at: 2,
  deletion_intent: 0,
};
const wsA2: WorkspaceDto = {
  workspace_id: 'wA2',
  task_id: 'tA2',
  worktree_path: '/tmp/wA2',
  branch_name: 'agent/wip-A2',
  base_branch: 'main',
  status: 'done',
  created_at: 3,
  deletion_intent: 0,
};

function configure(
  repos: RepoDto[],
  tasksByRepo: Record<string, TaskDto[]>,
  workspaces: WorkspaceDto[],
): void {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BindingsService,
        useValue: {
          listRepos: vi.fn(async () => repos),
          listTasks: vi.fn(async (repoId: string) => tasksByRepo[repoId] ?? []),
          listWorkspaces: vi.fn(async () => workspaces),
          addRepo: vi.fn(),
          archiveWorkspace: vi.fn(),
          createWorkspace: vi.fn(),
          listRuns: vi.fn(),
          getWorkspaceDiff: vi.fn(),
          discardWorkspaceChanges: vi.fn(),
          listBranches: vi.fn(),
          checkClaudeInstall: vi.fn(),
        },
      },
    ],
  });
}

describe('WorkspaceStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('loads all workspaces on init', async () => {
    configure([repoA], { rA: [taskA1, taskA2] }, [wsA1a, wsA1b, wsA2]);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(ws.all()).toHaveLength(3);
  });

  it('groups workspaces by task_id via the byTask computed', async () => {
    configure([repoA], { rA: [taskA1, taskA2] }, [wsA1a, wsA1b, wsA2]);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(ws.byTask().get('tA1')).toEqual([wsA1a, wsA1b]);
    expect(ws.byTask().get('tA2')).toEqual([wsA2]);
  });

  it('select(id) updates selectedWorkspaceId and persists it', async () => {
    configure([repoA], { rA: [taskA1] }, [wsA1a]);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    ws.select('wA1a');
    await new Promise((r) => setTimeout(r, 0));
    expect(ws.selectedWorkspaceId()).toBe('wA1a');
    const raw = localStorage.getItem('mozart.workspaces.selection');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}');
    expect(parsed.selectedWorkspaceId).toBe('wA1a');
  });

  it('persists ONLY selectedWorkspaceId — never the workspaces list', async () => {
    configure([repoA], { rA: [taskA1] }, [wsA1a]);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    ws.select('wA1a');
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('mozart.workspaces.selection');
    const parsed = raw ? JSON.parse(raw) : {};
    expect(parsed.all).toBeUndefined();
  });

  it('workspacesForProject reads task ids from TaskStore (cross-store)', async () => {
    configure([repoA], { rA: [taskA1, taskA2] }, [wsA1a, wsA1b, wsA2]);
    // Wake up the cross-store chain.
    TestBed.inject(ProjectStore);
    TestBed.inject(TaskStore);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    const list = ws.workspacesForProject('rA');
    expect(list.map((w) => w.workspace_id).sort()).toEqual([
      'wA1a',
      'wA1b',
      'wA2',
    ]);
  });

  it('workspacesForProject returns empty array when the project has no tasks loaded', async () => {
    configure([repoA], { rA: [] }, []);
    TestBed.inject(ProjectStore);
    TestBed.inject(TaskStore);
    const ws = TestBed.inject(WorkspaceStore);
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    expect(ws.workspacesForProject('rA')).toEqual([]);
  });
});
