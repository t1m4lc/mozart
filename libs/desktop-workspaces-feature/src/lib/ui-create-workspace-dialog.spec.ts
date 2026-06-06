import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { describe, expect, it, vi } from 'vitest';
import {
  CreateWorkspaceDialog,
  type CreateWorkspaceContext,
} from './ui-create-workspace-dialog';

interface DialogApi {
  selected: () => string;
  busy: () => boolean;
  create: () => Promise<void>;
  close: () => void;
}

interface MountOpts {
  context?: Partial<CreateWorkspaceContext>;
}

function mount(opts: MountOpts = {}) {
  const onCreate = vi.fn(async () => undefined);
  const ctx: CreateWorkspaceContext = {
    branches: ['main', 'develop', 'feature/x'],
    defaultBranch: 'develop',
    onCreate,
    ...opts.context,
  };
  const ref = {
    close: vi.fn(),
    setAriaLabelledBy: vi.fn(),
    setAriaDescribedBy: vi.fn(),
    setAriaLabel: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: ctx },
      { provide: BrnDialogRef, useValue: ref },
    ],
  });
  const fixture: ComponentFixture<CreateWorkspaceDialog> =
    TestBed.createComponent(CreateWorkspaceDialog);
  fixture.detectChanges();
  const cmp = fixture.componentInstance as unknown as DialogApi;
  return { fixture, cmp, ref, onCreate };
}

describe('CreateWorkspaceDialog', () => {
  it('preselects the resolved default branch', () => {
    const { cmp } = mount();
    expect(cmp.selected()).toBe('develop');
  });

  it('forks from the selected branch and closes on success', async () => {
    const { cmp, ref, onCreate } = mount();
    await cmp.create();
    expect(onCreate).toHaveBeenCalledWith('develop');
    expect(ref.close).toHaveBeenCalledTimes(1);
  });

  it('stays open (does not close) when creation fails', async () => {
    const onCreate = vi.fn(async () => {
      throw new Error('boom');
    });
    const { cmp, ref } = mount({ context: { onCreate } });
    await cmp.create();
    expect(ref.close).not.toHaveBeenCalled();
    expect(cmp.busy()).toBe(false);
  });

  it('closes without creating on cancel', () => {
    const { cmp, ref, onCreate } = mount();
    cmp.close();
    expect(ref.close).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
