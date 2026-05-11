import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingsService } from '../services/bindings.service';
import { TAURI_DIALOG_OPEN } from '../services/folder-picker.service';
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

function configure(listRepos: () => Promise<RepoDto[]>): void {
  TestBed.configureTestingModule({
    imports: [SidebarComponent],
    providers: [
      {
        provide: BindingsService,
        useValue: fakeBindings({ listRepos }),
      },
      // The strip's `+` button now mounts `<app-add-project-menu>` which
      // wires `FolderPickerService`. The service reads `TAURI_DIALOG_OPEN`
      // — provide an inert fake so the DI graph resolves under jsdom
      // without hitting the real `@tauri-apps/plugin-dialog` module.
      { provide: TAURI_DIALOG_OPEN, useValue: vi.fn(async () => null) },
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

  it('mounts the AddProjectMenu trigger in the strip', async () => {
    configure(() => Promise.resolve([]));
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    // The strip should host the `<app-add-project-menu>` element now
    // that the old single-button + dialog flow is gone.
    const menu = fixture.nativeElement.querySelector('app-add-project-menu');
    expect(menu).not.toBeNull();
    // And its trigger button should be present + enabled (it's the
    // dropdown opener now; the picker fires from the menu items).
    const trigger = menu?.querySelector('button.trigger-btn');
    expect(trigger).not.toBeNull();
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
  });
});
