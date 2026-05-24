import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkspacesFacade } from './workspace.facade';
import { WorkspaceMutationsFacade } from './workspace-mutations.facade';

// Centralized post-mutation choreography (D-r4). Verifies fan-out
// shape and that one fan-out failure (fileViews.refresh rejection)
// does not poison the others.

describe('WorkspaceMutationsFacade', () => {
  const repos = {
    refreshTreeInBackground: vi.fn().mockResolvedValue(undefined),
    refreshChangedFilesInBackground: vi.fn().mockResolvedValue(undefined),
  };
  const workspaces = {
    refreshDiffStats: vi.fn().mockResolvedValue(undefined),
  };
  const fileViews = {
    refresh: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    repos.refreshTreeInBackground.mockClear();
    repos.refreshChangedFilesInBackground.mockClear();
    workspaces.refreshDiffStats.mockClear();
    fileViews.refresh.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: RepositoriesFacade, useValue: repos },
        { provide: WorkspacesFacade, useValue: workspaces },
        { provide: FileViewsFacade, useValue: fileViews },
      ],
    });
  });

  it('fans out all four refreshes when called', () => {
    const facade = TestBed.inject(WorkspaceMutationsFacade);
    facade.softRefreshAfterMutation('ws-a');

    expect(repos.refreshTreeInBackground).toHaveBeenCalledWith('ws-a');
    expect(repos.refreshChangedFilesInBackground).toHaveBeenCalledWith('ws-a');
    expect(workspaces.refreshDiffStats).toHaveBeenCalled();
    expect(fileViews.refresh).toHaveBeenCalledWith('ws-a');
  });

  it('tolerates fileViews.refresh rejection without throwing', async () => {
    fileViews.refresh.mockRejectedValueOnce(new Error('boom'));
    const facade = TestBed.inject(WorkspaceMutationsFacade);
    facade.softRefreshAfterMutation('ws-a');

    // Awaiting a microtask lets the rejection propagate into the
    // facade's `.catch`. No throw means the catch handled it.
    await Promise.resolve();
    expect(fileViews.refresh).toHaveBeenCalled();
  });

  it('passes through the workspaceId to per-workspace refreshes', () => {
    const facade = TestBed.inject(WorkspaceMutationsFacade);
    facade.softRefreshAfterMutation('ws-XYZ');

    expect(repos.refreshTreeInBackground).toHaveBeenCalledWith('ws-XYZ');
    expect(repos.refreshChangedFilesInBackground).toHaveBeenCalledWith('ws-XYZ');
    expect(fileViews.refresh).toHaveBeenCalledWith('ws-XYZ');
  });
});
