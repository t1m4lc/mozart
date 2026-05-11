import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import type { RepoDto, TaskDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from './project.store';
import { TaskStore } from './task.store';

const repoA: RepoDto = {
  repo_id: 'rA',
  path: '/tmp/a',
  display_name: 'A',
  added_at: 1,
};
const repoB: RepoDto = {
  repo_id: 'rB',
  path: '/tmp/b',
  display_name: 'B',
  added_at: 2,
};

const taskA1: TaskDto = {
  task_id: 'tA1',
  repo_id: 'rA',
  title: 'Build sidebar',
  task_text: 'Build sidebar',
  status: 'active',
  created_at: 1,
};

const taskA2: TaskDto = {
  task_id: 'tA2',
  repo_id: 'rA',
  title: 'Wire diff',
  task_text: 'Wire diff',
  status: 'active',
  created_at: 2,
};

const taskB1: TaskDto = {
  task_id: 'tB1',
  repo_id: 'rB',
  title: 'Stream tokens',
  task_text: 'Stream tokens',
  status: 'active',
  created_at: 3,
};

interface FakeBindings {
  readonly listRepos: ReturnType<typeof vi.fn>;
  readonly listTasks: ReturnType<typeof vi.fn>;
}

function configure(
  repos: RepoDto[],
  tasksByRepo: Record<string, TaskDto[]>,
): FakeBindings {
  const listRepos = vi.fn(async () => repos);
  const listTasks = vi.fn(async (repoId: string) => tasksByRepo[repoId] ?? []);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BindingsService,
        useValue: {
          listRepos,
          listTasks,
          listWorkspaces: vi.fn(),
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
  return { listRepos, listTasks };
}

describe('TaskStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('initialises with empty maps and not loaded', () => {
    configure([], {});
    const tasks = TestBed.inject(TaskStore);
    expect(tasks.byProject().size).toBe(0);
    expect(tasks.byId().size).toBe(0);
  });

  it('refreshFor(repoId) populates byProject and byId', async () => {
    configure([], { rA: [taskA1, taskA2] });
    const tasks = TestBed.inject(TaskStore);
    tasks.refreshFor('rA');
    await new Promise((r) => setTimeout(r, 0));
    expect(tasks.byProject().get('rA')).toEqual([taskA1, taskA2]);
    expect(tasks.byId().get('tA1')?.title).toBe('Build sidebar');
    expect(tasks.byId().size).toBe(2);
  });

  it('auto-loads tasks for every project that ProjectStore exposes (cross-store)', async () => {
    configure([repoA, repoB], { rA: [taskA1], rB: [taskB1] });
    // Inject ProjectStore first so its onInit triggers refresh().
    TestBed.inject(ProjectStore);
    const tasks = TestBed.inject(TaskStore);
    // Allow async promises to resolve, then flush effects so the
    // cross-store hook sees the updated projects() and dispatches
    // refreshFor(...) for each repo.
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    expect(tasks.byProject().get('rA')).toEqual([taskA1]);
    expect(tasks.byProject().get('rB')).toEqual([taskB1]);
    expect(tasks.byId().get('tB1')?.title).toBe('Stream tokens');
  });

  it('refreshAll() loads tasks for every known project', async () => {
    configure([repoA, repoB], { rA: [taskA1], rB: [taskB1] });
    TestBed.inject(ProjectStore);
    const tasks = TestBed.inject(TaskStore);
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    tasks.refreshAll();
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    expect(tasks.byProject().size).toBeGreaterThanOrEqual(2);
  });

  it('does NOT persist anything to localStorage', async () => {
    configure([repoA], { rA: [taskA1] });
    TestBed.inject(ProjectStore);
    TestBed.inject(TaskStore);
    await new Promise((r) => setTimeout(r, 0));
    TestBed.tick();
    expect(localStorage.getItem('mozart.tasks')).toBeNull();
  });
});
