import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_ADAPTER,
  PROJECTS_ADAPTER,
} from '@mozart/desktop-projects-data-access';
import { TASKS_ADAPTER } from '@mozart/desktop-tasks-data-access';
import type { UiWorkspaceStatus, Workspace } from '@mozart/desktop-workspaces-util';
import { WorkspacesFacade } from './workspace.facade';
import { WorkspaceStore } from './workspace.store';
import { WORKSPACES_ADAPTER, type WorkspacesAdapter } from './workspaces.adapter';

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
    ...overrides,
  } as unknown as WorkspacesAdapter;
}

describe('WorkspacesFacade.setStatus', () => {
  let facade: WorkspacesFacade;
  let store: InstanceType<typeof WorkspaceStore>;
  let adapter: WorkspacesAdapter;

  beforeEach(() => {
    adapter = makeWorkspacesAdapterStub();
    TestBed.configureTestingModule({
      providers: [
        { provide: WORKSPACES_ADAPTER, useValue: adapter },
        // Stubs for the transitive deps WorkspacesFacade pulls into
        // its constructor via ProjectsFacade + TasksFacade. None are
        // exercised by the setStatus path; empty/no-op stubs suffice.
        { provide: DIALOG_ADAPTER, useValue: { confirm: vi.fn(), prompt: vi.fn() } },
        { provide: PROJECTS_ADAPTER, useValue: {} },
        { provide: TASKS_ADAPTER, useValue: {} },
      ],
    });
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
