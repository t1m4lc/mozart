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

function configure(listRepos: () => Promise<RepoDto[]>): void {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BindingsService,
        useValue: {
          listRepos,
          listTasks: vi.fn(),
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
});
