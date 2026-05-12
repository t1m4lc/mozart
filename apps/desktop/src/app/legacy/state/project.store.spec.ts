import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from './project.store';

const repoA: RepoDto = {
  repo_id: 'rA',
  path: '/tmp/a',
  display_name: 'Alpha',
  added_at: 1,
};
const repoB: RepoDto = {
  repo_id: 'rB',
  path: '/tmp/b',
  display_name: 'Bravo',
  added_at: 2,
};

interface ConfigureOptions {
  readonly listRepos: () => Promise<RepoDto[]>;
  readonly addRepo?: (path: string) => Promise<RepoDto>;
}

function configure(opts: ConfigureOptions | (() => Promise<RepoDto[]>)): void {
  const o: ConfigureOptions =
    typeof opts === 'function' ? { listRepos: opts } : opts;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BindingsService,
        useValue: {
          listRepos: o.listRepos,
          listTasks: vi.fn(),
          listWorkspaces: vi.fn(),
          addRepo: o.addRepo ?? vi.fn(),
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

describe('ProjectStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initialises with empty projects + null selection', async () => {
    configure(() => Promise.resolve([]));
    const store = TestBed.inject(ProjectStore);
    // withHooks { onInit } triggers refresh immediately; wait a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(store.projects()).toEqual([]);
    expect(store.selectedProjectId()).toBeNull();
  });

  it('loads projects via BindingsService.listRepos on init', async () => {
    configure(() => Promise.resolve([repoA, repoB]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.projects()).toHaveLength(2);
    expect(store.projectsLoaded()).toBe(true);
  });

  it('auto-selects the first project when no prior selection exists', async () => {
    configure(() => Promise.resolve([repoA, repoB]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.selectedProjectId()).toBe('rA');
    expect(store.selectedProject()?.repo_id).toBe('rA');
  });

  it('select(id) updates selectedProjectId', async () => {
    configure(() => Promise.resolve([repoA, repoB]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    store.select('rB');
    expect(store.selectedProjectId()).toBe('rB');
    expect(store.selectedProject()?.display_name).toBe('Bravo');
  });

  it('toggleExpanded adds then removes the project id', async () => {
    configure(() => Promise.resolve([repoA]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.expandedProjectIds()).not.toContain('rA');
    store.toggleExpanded('rA');
    expect(store.expandedProjectIds()).toContain('rA');
    store.toggleExpanded('rA');
    expect(store.expandedProjectIds()).not.toContain('rA');
  });

  it('writes selectedProjectId + expandedProjectIds to localStorage on change', async () => {
    configure(() => Promise.resolve([repoA, repoB]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    store.select('rB');
    store.toggleExpanded('rB');
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('mozart.projects.selection');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}');
    expect(parsed.selectedProjectId).toBe('rB');
    expect(parsed.expandedProjectIds).toContain('rB');
  });

  it('does NOT persist server-derived projects to localStorage', async () => {
    configure(() => Promise.resolve([repoA]));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    store.select('rA');
    await new Promise((r) => setTimeout(r, 0));
    const raw = localStorage.getItem('mozart.projects.selection');
    const parsed = raw ? JSON.parse(raw) : {};
    expect(parsed.projects).toBeUndefined();
  });

  it('captures errorDetail when listRepos rejects with a MozartError', async () => {
    const err = new MozartError('Db', 'sqlite locked');
    configure(() => Promise.reject(err));
    const store = TestBed.inject(ProjectStore);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.errorDetail()).toBeInstanceOf(MozartError);
    expect(store.errorDetail()?.kind).toBe('Db');
    expect(store.projectsError()).toBeTruthy();
  });

  describe('addRepo', () => {
    it('calls bindings.addRepo, refreshes the list, and selects the new repo', async () => {
      const newRepo: RepoDto = {
        repo_id: 'rC',
        path: '/tmp/c',
        display_name: 'Charlie',
        added_at: 3,
      };
      // First listRepos returns [repoA]; second (after addRepo) returns [repoA, newRepo].
      const calls: RepoDto[][] = [[repoA], [repoA, newRepo]];
      const listRepos = vi.fn(async () => {
        return calls.shift() ?? [];
      });
      const addRepoSpy = vi.fn(async () => newRepo);
      configure({ listRepos, addRepo: addRepoSpy });

      const store = TestBed.inject(ProjectStore);
      // First init populates [repoA] and selects rA.
      await new Promise((r) => setTimeout(r, 0));
      expect(store.selectedProjectId()).toBe('rA');

      const result = await store.addRepo('/tmp/c');
      // Allow the refresh rxMethod to complete.
      await new Promise((r) => setTimeout(r, 0));

      expect(addRepoSpy).toHaveBeenCalledWith('/tmp/c');
      expect(result).toEqual(newRepo);
      expect(store.projects().map((p) => p.repo_id)).toContain('rC');
      // The new repo should be the active selection after addRepo.
      expect(store.selectedProjectId()).toBe('rC');
    });

    it('stores the MozartError in errorDetail and re-throws on failure', async () => {
      const err = new MozartError('Validation', 'repo not usable: NonGit');
      const addRepoSpy = vi.fn(async () => {
        throw err;
      });
      configure({ listRepos: () => Promise.resolve([]), addRepo: addRepoSpy });

      const store = TestBed.inject(ProjectStore);
      await new Promise((r) => setTimeout(r, 0));

      await expect(store.addRepo('/tmp/bad')).rejects.toBe(err);
      expect(store.errorDetail()).toBeInstanceOf(MozartError);
      expect(store.errorDetail()?.kind).toBe('Validation');
    });

    it('wraps non-MozartError rejections as MozartError(Io)', async () => {
      const addRepoSpy = vi.fn(async () => {
        throw new Error('socket hangup');
      });
      configure({ listRepos: () => Promise.resolve([]), addRepo: addRepoSpy });

      const store = TestBed.inject(ProjectStore);
      await new Promise((r) => setTimeout(r, 0));

      await expect(store.addRepo('/tmp/x')).rejects.toBeInstanceOf(MozartError);
      const detail = store.errorDetail();
      expect(detail?.kind).toBe('Io');
      expect(detail?.message).toContain('socket hangup');
    });
  });
});
