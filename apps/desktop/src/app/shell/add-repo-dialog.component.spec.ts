/**
 * Spec for `AddRepoDialogComponent` (S1.8b.5).
 *
 * The dialog is a standalone component that takes its closing handle
 * via `BrnDialogRef` and reads the underlying `ProjectStore` for the
 * `addRepo` action. Tests inject fakes for both so we can drive the
 * happy + error paths deterministically.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MozartError } from '../services/mozart-error';
import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';
import { AddRepoDialogComponent } from './add-repo-dialog.component';

interface ProjectStoreFake {
  readonly addRepo: ReturnType<typeof vi.fn>;
}

interface DialogRefFake {
  readonly close: ReturnType<typeof vi.fn>;
  readonly setAriaLabelledBy: ReturnType<typeof vi.fn>;
  readonly setAriaDescribedBy: ReturnType<typeof vi.fn>;
  readonly setAriaLabel: ReturnType<typeof vi.fn>;
}

function setup(opts?: {
  readonly addRepo?: (path: string) => Promise<RepoDto>;
}): {
  readonly projectStoreFake: ProjectStoreFake;
  readonly dialogRefFake: DialogRefFake;
} {
  const projectStoreFake: ProjectStoreFake = {
    addRepo: vi.fn(opts?.addRepo ?? (async () => ({}) as RepoDto)),
  };
  // The dialog uses `[hlmDialogTitle]` / `[hlmDialogDescription]`, both
  // of which transitively call `setAria*` on the surrounding
  // `BrnDialogRef`. We stub those into no-ops so the title/description
  // directives can mount without exploding.
  const dialogRefFake: DialogRefFake = {
    close: vi.fn(),
    setAriaLabelledBy: vi.fn(),
    setAriaDescribedBy: vi.fn(),
    setAriaLabel: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ProjectStore, useValue: projectStoreFake },
      { provide: BrnDialogRef, useValue: dialogRefFake },
    ],
  });
  return { projectStoreFake, dialogRefFake };
}

describe('AddRepoDialogComponent', () => {
  beforeEach(() => {
    // The dialog imports tauri-specta-aware services indirectly through
    // ProjectStore — but we override that to a fake, so the runtime
    // shim isn't actually needed. Keeping this in case future tests
    // grow into a real ProjectStore.
    window.__TAURI_INTERNALS__ = { transformCallback: () => 0 };
  });

  it('renders the title, path input, Browse (disabled), Cancel and Add buttons', () => {
    setup();
    const fixture = TestBed.createComponent(AddRepoDialogComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent ?? '').toContain('Add repository');
    expect(host.querySelector('input[name="path"]')).not.toBeNull();
    const browse = host.querySelector(
      'button.browse-btn',
    ) as HTMLButtonElement | null;
    expect(browse).not.toBeNull();
    expect(browse?.disabled).toBe(true);
    expect(host.textContent ?? '').toContain('Cancel');
    expect(host.textContent ?? '').toContain('Add');
  });

  it('keeps the Add (submit) button disabled until the path is non-empty', () => {
    setup();
    const fixture = TestBed.createComponent(AddRepoDialogComponent);
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector(
      'button.submit-btn',
    ) as HTMLButtonElement | null;
    expect(submit).not.toBeNull();
    expect(submit?.disabled).toBe(true);

    fixture.componentInstance.pathInput.set('/tmp/repo');
    fixture.detectChanges();
    expect(submit?.disabled).toBe(false);
  });

  it('calls projectStore.addRepo with the trimmed path on submit', async () => {
    const newRepo: RepoDto = {
      repo_id: 'rZ',
      path: '/tmp/zed',
      display_name: 'Zed',
      added_at: 1,
    };
    const { projectStoreFake, dialogRefFake } = setup({
      addRepo: vi.fn(async () => newRepo),
    });
    const fixture = TestBed.createComponent(AddRepoDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.pathInput.set('  /tmp/zed  ');
    await fixture.componentInstance.submit();
    expect(projectStoreFake.addRepo).toHaveBeenCalledWith('/tmp/zed');
    expect(dialogRefFake.close).toHaveBeenCalledWith(newRepo);
  });

  it('keeps the dialog open and shows an error message when addRepo rejects', async () => {
    const err = new MozartError('Validation', 'repo not usable: NonGit');
    const { dialogRefFake } = setup({
      addRepo: vi.fn(async () => {
        throw err;
      }),
    });
    const fixture = TestBed.createComponent(AddRepoDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.pathInput.set('/tmp/bad');
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(dialogRefFake.close).not.toHaveBeenCalled();
    const banner = fixture.nativeElement.querySelector(
      '.error-msg',
    ) as HTMLElement | null;
    expect(banner?.textContent ?? '').toContain('repo not usable: NonGit');
  });

  it('cancel() closes the dialog without a result', () => {
    const { dialogRefFake } = setup();
    const fixture = TestBed.createComponent(AddRepoDialogComponent);
    fixture.detectChanges();
    fixture.componentInstance.cancel();
    expect(dialogRefFake.close).toHaveBeenCalledWith();
  });
});
