import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspacesFacade,
  type CreatedPr,
} from '@mozart/desktop-workspaces-data-access';
import {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';

// The dialog now has a single job: commit the (already-probed)
// uncommitted paths, then open the PR. The not-connected / non-GitHub /
// clean-tree / already-has-PR cases are handled by the click router
// (shell-right) before this dialog ever opens.

interface WorkspacesStub {
  readonly createPr: ReturnType<typeof vi.fn>;
  readonly commitWorkspace: ReturnType<typeof vi.fn>;
}

interface WorkspacesOpts {
  readonly resolve?: { readonly pr: CreatedPr; readonly statusFlipFailed: boolean };
  readonly reject?: unknown;
}

function makeWorkspaces(opts: WorkspacesOpts = {}): WorkspacesStub {
  return {
    createPr: vi.fn(async () => {
      if (opts.reject) throw opts.reject;
      return (
        opts.resolve ?? {
          pr: { number: 1, htmlUrl: 'https://github.com/foo/bar/pull/1' },
          statusFlipFailed: false,
        }
      );
    }),
    commitWorkspace: vi.fn(async () => ({ sha: 'abc123', statusFlipFailed: false })),
  };
}

interface MountOpts {
  readonly workspaces?: WorkspacesStub;
  readonly context?: CreatePrDialogContext;
}

interface Mounted {
  fixture: ComponentFixture<FeatureCreatePrDialog>;
  workspaces: WorkspacesStub;
  ref: { close: ReturnType<typeof vi.fn> };
}

function mount(opts: MountOpts = {}): Mounted {
  const workspaces = opts.workspaces ?? makeWorkspaces();
  const ctx: CreatePrDialogContext = opts.context ?? {
    workspaceId: 'ws1',
    defaultTitle: 'My workspace',
    changedPaths: ['src/a.ts', 'src/b.ts'],
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
      { provide: WorkspacesFacade, useValue: workspaces },
    ],
  });
  const fixture = TestBed.createComponent(FeatureCreatePrDialog);
  fixture.detectChanges();
  return { fixture, workspaces, ref };
}

function buttons(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLButtonElement[] {
  return f.debugElement
    .queryAll(By.css('button[hlmBtn]'))
    .map((d) => d.nativeElement as HTMLButtonElement);
}

function buttonByText(
  f: ComponentFixture<FeatureCreatePrDialog>,
  text: string,
): HTMLButtonElement | null {
  return buttons(f).find((b) => b.textContent?.trim().includes(text)) ?? null;
}

function clickByText(
  f: ComponentFixture<FeatureCreatePrDialog>,
  text: string,
): void {
  const btn = buttonByText(f, text);
  if (!btn) throw new Error(`button containing "${text}" not found`);
  btn.click();
}

function inlineErrorEl(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLElement | null {
  const found = f.debugElement.query(By.css('p.text-destructive'));
  return found ? (found.nativeElement as HTMLElement) : null;
}

describe('FeatureCreatePrDialog — commit-and-create', () => {
  it('shows the uncommitted-changes alert + a prefilled temp commit message', () => {
    const { fixture } = mount();
    expect(fixture.nativeElement.textContent).toContain('uncommitted changes');
    const input = fixture.debugElement.query(By.css('input[hlmInput]'));
    expect(input).not.toBeNull();
    expect((input.nativeElement as HTMLInputElement).value).toBe('My workspace');
    expect(buttonByText(fixture, 'Commit all & create PR')).not.toBeNull();
  });

  it('commits all probed paths, then creates the PR, announces it, and closes', async () => {
    const onCreated = vi.fn();
    const workspaces = makeWorkspaces();
    const { fixture, ref } = mount({
      workspaces,
      context: {
        workspaceId: 'ws1',
        defaultTitle: 'My workspace',
        changedPaths: ['src/a.ts', 'src/b.ts'],
        onCreated,
      },
    });
    clickByText(fixture, 'Commit all & create PR');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.commitWorkspace).toHaveBeenCalledWith(
      'ws1',
      ['src/a.ts', 'src/b.ts'],
      'My workspace',
    );
    expect(workspaces.createPr).toHaveBeenCalledWith('ws1', 'My workspace', '', false);
    expect(onCreated).toHaveBeenCalledWith({
      url: 'https://github.com/foo/bar/pull/1',
      number: 1,
      statusFlipFailed: false,
    });
    expect(ref.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic title when defaultTitle is empty', async () => {
    const workspaces = makeWorkspaces();
    const { fixture } = mount({
      workspaces,
      context: { workspaceId: 'ws1', defaultTitle: '', changedPaths: ['src/a.ts'] },
    });
    clickByText(fixture, 'Commit all & create PR');
    await fixture.whenStable();
    expect(workspaces.commitWorkspace).toHaveBeenCalledWith(
      'ws1',
      ['src/a.ts'],
      'Mozart pull request',
    );
    expect(workspaces.createPr).toHaveBeenCalledWith(
      'ws1',
      'Mozart pull request',
      '',
      false,
    );
  });

  it('surfaces a thrown error inline, keeps the dialog open, and does not close', async () => {
    const workspaces = makeWorkspaces({ reject: new Error('NoGithubToken') });
    const { fixture, ref } = mount({ workspaces });
    clickByText(fixture, 'Commit all & create PR');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(inlineErrorEl(fixture)?.textContent).toContain('NoGithubToken');
    expect(buttonByText(fixture, 'Commit all & create PR')?.disabled).toBe(false);
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('surfaces a thrown AppError object ({ kind, message }) inline', async () => {
    const workspaces = makeWorkspaces({
      reject: { kind: 'NoGithubToken', message: 'GitHub token not configured' },
    });
    const { fixture } = mount({ workspaces });
    clickByText(fixture, 'Commit all & create PR');
    await fixture.whenStable();
    fixture.detectChanges();
    const errEl = inlineErrorEl(fixture);
    expect(errEl?.textContent).toContain('GitHub token not configured');
    expect(errEl?.textContent).not.toContain('[object Object]');
  });

  it('disables submit when the user clears the commit message', () => {
    const { fixture } = mount();
    const input = fixture.debugElement.query(By.css('input[hlmInput]'))
      .nativeElement as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(buttonByText(fixture, 'Commit all & create PR')?.disabled).toBe(true);
  });

  it('guards against double-submit while one call is in flight', async () => {
    // Delay the first async step (commit) so the in-flight `committing`
    // phase is observable synchronously — `phase.set('committing')` runs
    // before the first await, making the guard assertion deterministic.
    const deferred = makeDeferred();
    const workspaces: WorkspacesStub = {
      commitWorkspace: vi.fn(async () => {
        await deferred.promise;
        return { sha: 'abc123', statusFlipFailed: false };
      }),
      createPr: vi.fn(async () => ({
        pr: { number: 1, htmlUrl: 'https://github.com/foo/bar/pull/1' },
        statusFlipFailed: false,
      })),
    };
    const { fixture } = mount({ workspaces });
    clickByText(fixture, 'Commit all & create PR');
    fixture.detectChanges();
    const pending = buttonByText(fixture, 'Committing…');
    expect(pending).not.toBeNull();
    expect(pending?.disabled).toBe(true);
    pending?.click();
    expect(workspaces.commitWorkspace).toHaveBeenCalledTimes(1);
    deferred.resolve();
    // setTimeout drains the full microtask chain (commit await → creating
    // → createPr await → close) before we assert.
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(workspaces.commitWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
  });
});

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function makeDeferred(): Deferred {
  let resolveFn = (): void => undefined;
  const promise = new Promise<void>((r) => {
    resolveFn = r;
  });
  return { promise, resolve: () => resolveFn() };
}
