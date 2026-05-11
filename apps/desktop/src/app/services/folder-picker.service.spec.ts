/**
 * Spec for `FolderPickerService`.
 *
 * The service wraps `openDialog` from `@tauri-apps/plugin-dialog` so the
 * `+ Open project` dropdown entry can fire the OS-native folder picker
 * and then forward the chosen path to `ProjectStore.addRepo`.
 *
 * Mocking strategy: like `BindingsService`, the service takes the
 * `openDialog` function via an Angular `InjectionToken` so specs can
 * substitute fakes without resorting to module-level `vi.mock` of a
 * relative import (which the project's unit-test runner disallows). The
 * production default-factory points at the real `openDialog`.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MozartError } from './mozart-error';
import {
  FolderPickerService,
  TAURI_DIALOG_OPEN,
  type TauriDialogOpen,
} from './folder-picker.service';
import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';

interface ProjectStoreFake {
  readonly addRepo: ReturnType<typeof vi.fn>;
}

function setup(opts: {
  readonly openDialog: TauriDialogOpen;
  readonly addRepo?: (path: string) => Promise<RepoDto>;
}): {
  readonly svc: FolderPickerService;
  readonly projectStoreFake: ProjectStoreFake;
  readonly openDialogSpy: TauriDialogOpen;
} {
  const projectStoreFake: ProjectStoreFake = {
    addRepo: vi.fn(opts.addRepo ?? (async () => ({}) as RepoDto)),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProjectStore, useValue: projectStoreFake },
      { provide: TAURI_DIALOG_OPEN, useValue: opts.openDialog },
    ],
  });
  return {
    svc: TestBed.inject(FolderPickerService),
    projectStoreFake,
    openDialogSpy: opts.openDialog,
  };
}

const repoR: RepoDto = {
  repo_id: 'rR',
  path: '/tmp/repo',
  display_name: 'repo',
  added_at: 1,
};

describe('FolderPickerService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens the native folder picker and calls projectStore.addRepo on selection', async () => {
    const openDialog: TauriDialogOpen = vi.fn(async () => '/tmp/repo');
    const { svc, projectStoreFake } = setup({
      openDialog,
      addRepo: vi.fn(async () => repoR),
    });

    const result = await svc.openAndAddRepo();

    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
    expect(projectStoreFake.addRepo).toHaveBeenCalledWith('/tmp/repo');
    expect(result).toBe(repoR);
  });

  it('returns null and skips addRepo when the user cancels (openDialog → null)', async () => {
    const openDialog: TauriDialogOpen = vi.fn(async () => null);
    const { svc, projectStoreFake } = setup({ openDialog });

    const result = await svc.openAndAddRepo();

    expect(result).toBeNull();
    expect(projectStoreFake.addRepo).not.toHaveBeenCalled();
  });

  it('returns null when openDialog yields an empty string (defensive)', async () => {
    const openDialog: TauriDialogOpen = vi.fn(async () => '');
    const { svc, projectStoreFake } = setup({ openDialog });

    const result = await svc.openAndAddRepo();

    expect(result).toBeNull();
    expect(projectStoreFake.addRepo).not.toHaveBeenCalled();
  });

  it('narrows a string-array result down to the first entry (multiple=false safety)', async () => {
    const openDialog: TauriDialogOpen = vi.fn(async () => ['/tmp/repo']);
    const { svc, projectStoreFake } = setup({
      openDialog,
      addRepo: vi.fn(async () => repoR),
    });

    await svc.openAndAddRepo();

    expect(projectStoreFake.addRepo).toHaveBeenCalledWith('/tmp/repo');
  });

  it('propagates MozartError when projectStore.addRepo rejects', async () => {
    const err = new MozartError('Validation', 'repo not usable: NonGit');
    const openDialog: TauriDialogOpen = vi.fn(async () => '/tmp/notgit');
    const { svc } = setup({
      openDialog,
      addRepo: vi.fn(async () => {
        throw err;
      }),
    });

    await expect(svc.openAndAddRepo()).rejects.toBe(err);
  });

  it('propagates errors when openDialog itself rejects', async () => {
    const err = new Error('plugin-dialog: permission denied');
    const openDialog: TauriDialogOpen = vi.fn(async () => {
      throw err;
    });
    const { svc, projectStoreFake } = setup({ openDialog });

    await expect(svc.openAndAddRepo()).rejects.toBe(err);
    expect(projectStoreFake.addRepo).not.toHaveBeenCalled();
  });
});
