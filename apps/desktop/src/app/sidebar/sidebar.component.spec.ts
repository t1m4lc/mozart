import { TestBed } from '@angular/core/testing';
import { HlmDialogService } from '@mozart/ui/dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { SidebarComponent } from './sidebar.component';

const repoA: RepoDto = {
  repo_id: 'rA',
  path: '/tmp/a',
  display_name: 'Alpha',
  added_at: 1,
};

function fakeBindings(opts: { listRepos: () => Promise<RepoDto[]> }): unknown {
  return {
    listRepos: opts.listRepos,
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

interface DialogServiceFake {
  readonly open: ReturnType<typeof vi.fn>;
}

function configure(
  listRepos: () => Promise<RepoDto[]>,
  dialogFake?: DialogServiceFake,
): void {
  TestBed.configureTestingModule({
    imports: [SidebarComponent],
    providers: [
      {
        provide: BindingsService,
        useValue: fakeBindings({ listRepos }),
      },
      ...(dialogFake
        ? [{ provide: HlmDialogService, useValue: dialogFake }]
        : []),
    ],
  });
}

describe('SidebarComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the nav strip with role="navigation"', async () => {
    configure(() => Promise.resolve([]));
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector('nav[role="navigation"]');
    expect(nav).not.toBeNull();
    expect(nav?.querySelector('.label')?.textContent?.trim()).toBe('PROJECTS');
  });

  it('renders the empty card when ProjectStore.projects() is []', async () => {
    configure(() => Promise.resolve([]));
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-sidebar-empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-project-row')).toBeNull();
  });

  it('renders the error card when ProjectStore.errorDetail() is set', async () => {
    configure(() =>
      Promise.reject(new MozartError('Db', 'cannot reach db')),
    );
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const err = fixture.nativeElement.querySelector('app-sidebar-error');
    expect(err).not.toBeNull();
    expect(err?.textContent ?? '').toContain('cannot reach db');
  });

  it('renders one project-row per repo when populated', async () => {
    configure(() => Promise.resolve([repoA]));
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('app-project-row');
    expect(rows.length).toBe(1);
  });

  it('opens AddRepoDialog when the strip "+" button is clicked', async () => {
    const dialogFake: DialogServiceFake = { open: vi.fn() };
    configure(() => Promise.resolve([]), dialogFake);
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      'button.add-project-btn',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
    btn?.click();
    expect(dialogFake.open).toHaveBeenCalledTimes(1);
    // First arg is the component constructor; assert by name (allowing
    // the Angular bundler's "_" prefix) so we don't have to import the
    // dialog into the spec.
    const firstCall = dialogFake.open.mock.calls[0];
    expect(typeof firstCall[0]).toBe('function');
    expect((firstCall[0] as { name: string }).name).toContain(
      'AddRepoDialogComponent',
    );
  });
});
