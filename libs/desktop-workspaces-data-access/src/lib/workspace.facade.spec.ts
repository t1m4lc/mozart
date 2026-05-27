import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_ADAPTER,
  PROJECTS_ADAPTER,
} from '@mozart/desktop-projects-data-access';
import { REPOSITORIES_ADAPTER } from '@mozart/desktop-repositories-data-access';
import { RUNS_ADAPTER } from '@mozart/desktop-runs-data-access';
import { TASKS_ADAPTER } from '@mozart/desktop-tasks-data-access';
import { TERMINALS_ADAPTER } from '@mozart/desktop-terminals-data-access';
import { provideTheme } from '@mozart/shared-util-theme';
import type { UiWorkspaceStatus, Workspace } from '@mozart/desktop-workspaces-util';
import { WorkspacesFacade } from './workspace.facade';
import { WorkspaceStore } from './workspace.store';
import {
  WORKSPACES_ADAPTER,
  type CreatedPr,
  type WorkspacesAdapter,
} from './workspaces.adapter';

// Plan P1.1 § 7.6 — T10 (workspace.facade.spec.ts).
//
// First slice landed with T3: setStatus idempotency. The rest of T10
// (commitWorkspace from-state guard, createPr from-state guard +
// best-effort flip-failure, rollback semantics) lands alongside T1/T2.
//
// Adapter ports are stubbed because none of these tests need real
// Tauri calls — the facade method under test reads/writes exclusively
// through the in-memory store and the (stubbed) adapter.

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws1',
    projectId: 'proj1',
    name: 'test-workspace',
    branch: 'feat/test',
    baseBranch: 'main',
    status: 'backlog',
    pinned: false,
    unread: false,
    pending: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastMergeAction: null,
    ...overrides,
  };
}

function makeWorkspacesAdapterStub(
  overrides: Partial<WorkspacesAdapter> = {},
): WorkspacesAdapter {
  const fakeCreatedPr: CreatedPr = { number: 42, htmlUrl: 'https://example' };
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue(undefined),
    listBranches: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue(undefined),
    setUiStatus: vi.fn().mockResolvedValue(undefined),
    reopen: vi.fn().mockResolvedValue(undefined),
    setPinned: vi.fn().mockResolvedValue(undefined),
    setUnread: vi.fn().mockResolvedValue(undefined),
    installPackages: vi.fn(),
    detectInstalledIdes: vi.fn().mockResolvedValue([]),
    openInIde: vi.fn().mockResolvedValue(undefined),
    listDiffStats: vi.fn().mockResolvedValue([]),
    createPr: vi.fn().mockResolvedValue(fakeCreatedPr),
    ...overrides,
  } as unknown as WorkspacesAdapter;
}

function makeRepositoriesAdapterStub(commitWorkspaceImpl?: () => Promise<string>) {
  return {
    commitWorkspace:
      commitWorkspaceImpl ??
      vi.fn().mockResolvedValue('deadbeef0000000000000000000000000000face'),
    listTree: vi.fn().mockResolvedValue([]),
    watchTree: vi.fn().mockResolvedValue(() => undefined),
    getFileDiff: vi.fn().mockResolvedValue(''),
    readFile: vi.fn().mockResolvedValue(''),
    listChangedFiles: vi.fn().mockResolvedValue([]),
  };
}

function configureModule(overrides: {
  workspacesAdapter?: WorkspacesAdapter;
  repositoriesAdapter?: ReturnType<typeof makeRepositoriesAdapterStub>;
} = {}) {
  const workspacesAdapter = overrides.workspacesAdapter ?? makeWorkspacesAdapterStub();
  const repositoriesAdapter =
    overrides.repositoriesAdapter ?? makeRepositoriesAdapterStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: WORKSPACES_ADAPTER, useValue: workspacesAdapter },
      { provide: REPOSITORIES_ADAPTER, useValue: repositoriesAdapter },
      // Stubs for the transitive deps WorkspacesFacade pulls into its
      // constructor via ProjectsFacade + TasksFacade. None are exercised
      // by the methods under test; empty/no-op stubs suffice.
      {
        provide: DIALOG_ADAPTER,
        useValue: { confirm: vi.fn(), prompt: vi.fn() },
      },
      { provide: PROJECTS_ADAPTER, useValue: {} },
      { provide: TASKS_ADAPTER, useValue: {} },
      // WorkspacesFacade → TerminalRegistry → TerminalsFacade → TERMINALS_ADAPTER.
      // None of the methods under test exercise terminal IO; an empty stub suffices.
      {
        provide: TERMINALS_ADAPTER,
        useValue: {
          open: vi.fn(),
          write: vi.fn(),
          resize: vi.fn(),
        },
      },
      // RunRegistry → RunsFacade → RUNS_ADAPTER. The facade pulls it in
      // for runInstall's setupCommand pathway; tests under this file
      // never exercise that branch, so a no-op stub is enough.
      {
        provide: RUNS_ADAPTER,
        useValue: {
          openRun: vi.fn(),
          openSetup: vi.fn(),
          stopRun: vi.fn(),
        },
      },
      // RunRegistry's constructor effect reads ThemeService, which
      // needs THEME_CONFIG. Mozart's light defaults are fine for tests.
      provideTheme({ theme: 'mozart', mode: 'light' }),
      // Force the server platform so ThemeService skips
      // matchMedia(...) (jsdom doesn't ship it).
      { provide: PLATFORM_ID, useValue: 'server' },
    ],
  });
  return { workspacesAdapter, repositoriesAdapter };
}

describe('WorkspacesFacade.setStatus', () => {
  let facade: WorkspacesFacade;
  let store: InstanceType<typeof WorkspaceStore>;
  let adapter: WorkspacesAdapter;

  beforeEach(() => {
    ({ workspacesAdapter: adapter } = configureModule());
    facade = TestBed.inject(WorkspacesFacade);
    store = TestBed.inject(WorkspaceStore);
    store.setAll([makeWorkspace({ id: 'ws1', status: 'backlog' })]);
  });

  it('is a no-op when the new status equals the current status', async () => {
    await facade.setStatus('ws1', 'backlog');
    expect(adapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('backlog');
  });

  it('persists via the adapter and updates the store when the status differs', async () => {
    await facade.setStatus('ws1', 'in_progress');
    expect(adapter.setUiStatus).toHaveBeenCalledWith('ws1', 'in_progress');
    expect(facade.workspaceById('ws1')()?.status).toBe('in_progress');
  });

  it('rolls back the in-memory status when the adapter throws', async () => {
    (adapter.setUiStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    await expect(facade.setStatus('ws1', 'in_review')).rejects.toThrow('boom');
    expect(facade.workspaceById('ws1')()?.status).toBe('backlog');
  });

  it('does not touch unrelated workspaces', async () => {
    store.upsertOne(makeWorkspace({ id: 'ws2', status: 'in_progress' }));
    await facade.setStatus('ws1', 'in_review' satisfies UiWorkspaceStatus);
    expect(facade.workspaceById('ws2')()?.status).toBe('in_progress');
  });

  it('silently no-ops for an unknown workspace id', async () => {
    await facade.setStatus('nope', 'in_review');
    expect(adapter.setUiStatus).not.toHaveBeenCalled();
  });
});

// P1.1 D1 — wrapper for `commit → in_progress` (if backlog).
describe('WorkspacesFacade.commitWorkspace', () => {
  let facade: WorkspacesFacade;
  let store: InstanceType<typeof WorkspaceStore>;
  let workspacesAdapter: WorkspacesAdapter;
  let repositoriesAdapter: ReturnType<typeof makeRepositoriesAdapterStub>;

  beforeEach(() => {
    ({ workspacesAdapter, repositoriesAdapter } = configureModule());
    facade = TestBed.inject(WorkspacesFacade);
    store = TestBed.inject(WorkspaceStore);
    store.setAll([makeWorkspace({ id: 'ws1', status: 'backlog' })]);
  });

  it('flips backlog → in_progress on commit success', async () => {
    const out = await facade.commitWorkspace('ws1', ['src/a.ts'], 'message');
    expect(repositoriesAdapter.commitWorkspace).toHaveBeenCalledWith(
      'ws1',
      ['src/a.ts'],
      'message',
    );
    expect(workspacesAdapter.setUiStatus).toHaveBeenCalledWith('ws1', 'in_progress');
    expect(facade.workspaceById('ws1')()?.status).toBe('in_progress');
    expect(out.statusFlipFailed).toBe(false);
    expect(typeof out.sha).toBe('string');
  });

  it('does NOT flip when the workspace is already in_progress', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'in_progress' })]);
    const out = await facade.commitWorkspace('ws1', [], 'm');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('in_progress');
    expect(out.statusFlipFailed).toBe(false);
  });

  it('does NOT flip when the workspace is done or canceled', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'done' })]);
    await facade.commitWorkspace('ws1', [], 'm');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('done');

    store.setAll([makeWorkspace({ id: 'ws1', status: 'canceled' })]);
    (workspacesAdapter.setUiStatus as ReturnType<typeof vi.fn>).mockClear();
    await facade.commitWorkspace('ws1', [], 'm');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('canceled');
  });

  it('rethrows when the commit itself fails (no flip)', async () => {
    (repositoriesAdapter.commitWorkspace as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('git is sad'),
    );
    await expect(facade.commitWorkspace('ws1', [], 'm')).rejects.toThrow('git is sad');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('backlog');
  });

  it('returns statusFlipFailed=true when the post-commit flip fails (best-effort)', async () => {
    (workspacesAdapter.setUiStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('sqlite boom'),
    );
    const out = await facade.commitWorkspace('ws1', [], 'm');
    expect(out.statusFlipFailed).toBe(true);
    // Optimistic flip is KEPT (D2): the user sees in_progress until reload.
    expect(facade.workspaceById('ws1')()?.status).toBe('in_progress');
  });

  it('silently no-ops the flip for an unknown workspace id', async () => {
    (repositoriesAdapter.commitWorkspace as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'beef',
    );
    const out = await facade.commitWorkspace('nope', [], 'm');
    expect(out.sha).toBe('beef');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
  });
});

// P1.1 D1 + D2 + D3 — wrapper for `PR success → in_review` with from-
// state guards and best-effort flip-failure handling.
describe('WorkspacesFacade.createPr', () => {
  let facade: WorkspacesFacade;
  let store: InstanceType<typeof WorkspaceStore>;
  let workspacesAdapter: WorkspacesAdapter;
  const PR: CreatedPr = { number: 99, htmlUrl: 'https://github.com/owner/repo/pull/99' };

  beforeEach(() => {
    ({ workspacesAdapter } = configureModule({
      workspacesAdapter: makeWorkspacesAdapterStub({
        createPr: vi.fn().mockResolvedValue(PR),
      }),
    }));
    facade = TestBed.inject(WorkspacesFacade);
    store = TestBed.inject(WorkspaceStore);
    store.setAll([makeWorkspace({ id: 'ws1', status: 'backlog' })]);
  });

  it('flips backlog → in_review on PR success', async () => {
    const out = await facade.createPr('ws1', 'title', 'body', false);
    expect(workspacesAdapter.createPr).toHaveBeenCalledWith('ws1', 'title', 'body', false);
    expect(workspacesAdapter.setUiStatus).toHaveBeenCalledWith('ws1', 'in_review');
    expect(facade.workspaceById('ws1')()?.status).toBe('in_review');
    expect(out.pr).toEqual(PR);
    expect(out.statusFlipFailed).toBe(false);
  });

  it('flips in_progress → in_review on PR success', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'in_progress' })]);
    const out = await facade.createPr('ws1', 't', 'b', true);
    expect(workspacesAdapter.setUiStatus).toHaveBeenCalledWith('ws1', 'in_review');
    expect(facade.workspaceById('ws1')()?.status).toBe('in_review');
    expect(out.statusFlipFailed).toBe(false);
  });

  it('D3 guard — does NOT regress a `done` workspace to in_review', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'done' })]);
    const out = await facade.createPr('ws1', 't', 'b', false);
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('done');
    expect(out.pr).toEqual(PR);
    expect(out.statusFlipFailed).toBe(false);
  });

  it('D3 guard — does NOT regress a `canceled` workspace to in_review', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'canceled' })]);
    await facade.createPr('ws1', 't', 'b', false);
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('canceled');
  });

  it('no-op when workspace is already in_review (idempotent)', async () => {
    store.setAll([makeWorkspace({ id: 'ws1', status: 'in_review' })]);
    await facade.createPr('ws1', 't', 'b', false);
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('in_review');
  });

  it('rethrows when PR creation fails (no flip)', async () => {
    (workspacesAdapter.createPr as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('no remote'),
    );
    await expect(facade.createPr('ws1', 't', 'b', false)).rejects.toThrow('no remote');
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
    expect(facade.workspaceById('ws1')()?.status).toBe('backlog');
  });

  it('D2 best-effort — returns statusFlipFailed=true on flip failure but keeps the optimistic flip', async () => {
    (workspacesAdapter.setUiStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('sqlite boom'),
    );
    const out = await facade.createPr('ws1', 't', 'b', false);
    expect(out.pr).toEqual(PR);
    expect(out.statusFlipFailed).toBe(true);
    // PR is the ground truth — keep the optimistic flip so the user
    // sees in_review for the rest of the session.
    expect(facade.workspaceById('ws1')()?.status).toBe('in_review');
  });

  it('silently no-ops the flip for an unknown workspace id', async () => {
    const out = await facade.createPr('nope', 't', 'b', false);
    expect(out.pr).toEqual(PR);
    expect(workspacesAdapter.setUiStatus).not.toHaveBeenCalled();
  });
});
