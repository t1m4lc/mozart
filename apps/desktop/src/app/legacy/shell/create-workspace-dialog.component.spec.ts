/**
 * Spec for `CreateWorkspaceDialogComponent` (S1.8b.5).
 *
 * The dialog fetches available branches via `BindingsService.listBranches`
 * on init, lets the user pick a branch + task text, and on submit hands
 * everything to `WorkspaceStore.createWorkspace`. The "project" select
 * is locked to the invoking project (resolved either from the optional
 * `BRN_DIALOG_CTX` injection or from `ProjectStore.selectedProject()`).
 *
 * Tests inject fakes for `BindingsService`, `ProjectStore`,
 * `WorkspaceStore`, and `BrnDialogRef`.
 */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type {
  RepoDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';
import { WorkspaceStore } from '../state/workspace.store';
import {
  CREATE_WORKSPACE_DIALOG_CTX,
  CreateWorkspaceDialogComponent,
} from './create-workspace-dialog.component';

const repoA: RepoDto = {
  repo_id: 'rA',
  path: '/tmp/a',
  display_name: 'Alpha',
  added_at: 1,
};

interface BindingsFake {
  readonly listBranches: ReturnType<typeof vi.fn>;
}
interface WorkspaceStoreFake {
  readonly createWorkspace: ReturnType<typeof vi.fn>;
}
interface ProjectStoreFake {
  readonly projects: ReturnType<typeof signal<readonly RepoDto[]>>;
  readonly selectedProjectId: ReturnType<typeof signal<string | null>>;
  readonly selectedProject: ReturnType<typeof signal<RepoDto | null>>;
}
interface DialogRefFake {
  readonly close: ReturnType<typeof vi.fn>;
  readonly setAriaLabelledBy: ReturnType<typeof vi.fn>;
  readonly setAriaDescribedBy: ReturnType<typeof vi.fn>;
  readonly setAriaLabel: ReturnType<typeof vi.fn>;
}

function setup(opts?: {
  readonly listBranches?: (path: string) => Promise<string[]>;
  readonly createWorkspace?: (
    repoId: string,
    branch: string,
    text: string,
  ) => Promise<WorkspaceDto>;
  readonly projects?: readonly RepoDto[];
  readonly selectedProject?: RepoDto | null;
  readonly contextRepoId?: string | null;
}): {
  readonly bindingsFake: BindingsFake;
  readonly projectStoreFake: ProjectStoreFake;
  readonly workspaceStoreFake: WorkspaceStoreFake;
  readonly dialogRefFake: DialogRefFake;
} {
  const bindingsFake: BindingsFake = {
    listBranches: vi.fn(
      opts?.listBranches ?? (async () => ['main', 'develop']),
    ),
  };
  const projects = opts?.projects ?? [repoA];
  // Use `'selectedProject' in opts` so callers can explicitly opt into
  // a null selection — `?? repoA` would silently promote null back to
  // the default project.
  const selectedProject: RepoDto | null =
    opts !== undefined && 'selectedProject' in opts
      ? (opts.selectedProject ?? null)
      : repoA;
  const projectStoreFake: ProjectStoreFake = {
    projects: signal<readonly RepoDto[]>(projects),
    selectedProjectId: signal<string | null>(
      selectedProject ? selectedProject.repo_id : null,
    ),
    selectedProject: signal<RepoDto | null>(selectedProject),
  };
  const workspaceStoreFake: WorkspaceStoreFake = {
    createWorkspace: vi.fn(
      opts?.createWorkspace ??
        (async () =>
          ({
            workspace_id: 'wNew',
            task_id: 'tNew',
            worktree_path: '/tmp/wNew',
            branch_name: 'agent/wip-new',
            base_branch: 'main',
            status: 'ready',
            created_at: 1,
            deletion_intent: 0,
          }) as WorkspaceDto),
    ),
  };
  const dialogRefFake: DialogRefFake = {
    close: vi.fn(),
    setAriaLabelledBy: vi.fn(),
    setAriaDescribedBy: vi.fn(),
    setAriaLabel: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: BindingsService, useValue: bindingsFake },
      { provide: ProjectStore, useValue: projectStoreFake },
      { provide: WorkspaceStore, useValue: workspaceStoreFake },
      { provide: BrnDialogRef, useValue: dialogRefFake },
      {
        provide: CREATE_WORKSPACE_DIALOG_CTX,
        useValue:
          'contextRepoId' in (opts ?? {})
            ? { lockedRepoId: opts?.contextRepoId ?? null }
            : null,
      },
    ],
  });
  return { bindingsFake, projectStoreFake, workspaceStoreFake, dialogRefFake };
}

describe('CreateWorkspaceDialogComponent', () => {
  beforeEach(() => {
    window.__TAURI_INTERNALS__ = { transformCallback: () => 0 };
  });

  it('calls listBranches with the resolved project path on init', async () => {
    const { bindingsFake } = setup();
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    // The init effect runs synchronously in the constructor; let the
    // microtask queue drain so the promise resolves.
    await new Promise((r) => setTimeout(r, 0));
    expect(bindingsFake.listBranches).toHaveBeenCalledWith('/tmp/a');
  });

  it('shows the "Loading branches..." placeholder while listBranches is pending', () => {
    let resolveFn: ((branches: string[]) => void) | undefined;
    const pending = new Promise<string[]>((r) => {
      resolveFn = r;
    });
    setup({ listBranches: () => pending });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent ?? '').toContain('Loading branches');
    // Clean up — resolve so the dangling promise doesn't leak.
    if (resolveFn) resolveFn(['main']);
  });

  it('populates the branch select with the returned list', async () => {
    setup({ listBranches: async () => ['main', 'develop', 'feature/x'] });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(
      'select[name="branch"]',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    const opts = Array.from(select?.options ?? [])
      .map((o) => o.value)
      .filter((v) => v !== '');
    expect(opts).toEqual(['main', 'develop', 'feature/x']);
  });

  it('shows an inline error when listBranches returns an empty list', async () => {
    setup({ listBranches: async () => [] });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No branches found in this repository',
    );
  });

  it('keeps Create disabled until project, branch, and ≥3-char task text are set', async () => {
    setup({ listBranches: async () => ['main'] });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector(
      'button.submit-btn',
    ) as HTMLButtonElement | null;
    expect(submit?.disabled).toBe(true);

    fixture.componentInstance.baseBranch.set('main');
    fixture.componentInstance.taskText.set('hi'); // only 2 chars
    fixture.detectChanges();
    expect(submit?.disabled).toBe(true);

    fixture.componentInstance.taskText.set('fix the bug');
    fixture.detectChanges();
    expect(submit?.disabled).toBe(false);
  });

  it('shows "Select a project first" + disables Create when no project is resolvable', async () => {
    setup({
      selectedProject: null,
      contextRepoId: null,
      listBranches: async () => ['main'],
    });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Select a project first',
    );
    const submit = fixture.nativeElement.querySelector(
      'button.submit-btn',
    ) as HTMLButtonElement | null;
    expect(submit?.disabled).toBe(true);
  });

  it('submits to workspaceStore.createWorkspace and closes on success', async () => {
    const newWs: WorkspaceDto = {
      workspace_id: 'wNew',
      task_id: 'tNew',
      worktree_path: '/tmp/wNew',
      branch_name: 'agent/wip-new',
      base_branch: 'main',
      status: 'ready',
      created_at: 1,
      deletion_intent: 0,
    };
    const { workspaceStoreFake, dialogRefFake } = setup({
      listBranches: async () => ['main'],
      createWorkspace: vi.fn(async () => newWs),
    });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    fixture.componentInstance.baseBranch.set('main');
    fixture.componentInstance.taskText.set('fix the bug');
    await fixture.componentInstance.submit();
    expect(workspaceStoreFake.createWorkspace).toHaveBeenCalledWith(
      'rA',
      'main',
      'fix the bug',
    );
    expect(dialogRefFake.close).toHaveBeenCalledWith(newWs);
  });

  it('keeps the dialog open and shows an error message on createWorkspace rejection', async () => {
    const err = new MozartError('Db', 'task insert failed');
    const { dialogRefFake } = setup({
      listBranches: async () => ['main'],
      createWorkspace: vi.fn(async () => {
        throw err;
      }),
    });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    fixture.componentInstance.baseBranch.set('main');
    fixture.componentInstance.taskText.set('something');
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(dialogRefFake.close).not.toHaveBeenCalled();
    const banner = fixture.nativeElement.querySelector(
      '.error-msg',
    ) as HTMLElement | null;
    expect(banner?.textContent ?? '').toContain('task insert failed');
  });

  it('cancel() closes without a result', () => {
    const { dialogRefFake } = setup({ listBranches: async () => ['main'] });
    const fixture = TestBed.createComponent(CreateWorkspaceDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.cancel();
    expect(dialogRefFake.close).toHaveBeenCalledWith();
  });
});
