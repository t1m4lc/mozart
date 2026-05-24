import {
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import {
  WorkspacesFacade,
  type CreatedPr,
} from '@mozart/desktop-workspaces-data-access';
import {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';

// T12 — covers the Create-PR dialog's interplay with the GitHub auth
// gate (inline alert + submit disable, reactive mid-flow disconnect),
// the D2 partial-failure surface, and the double-submit guard. The
// dialog injects ProfileFacade + WorkspacesFacade via the new P1.1
// routing; both are stubbed with the smallest plausible shapes.

interface ProfileStub {
  readonly githubConnected: WritableSignal<boolean>;
}

interface WorkspacesStub {
  readonly createPr: ReturnType<typeof vi.fn>;
}

function makeProfile(connected = true): ProfileStub {
  return { githubConnected: signal(connected) };
}

interface WorkspacesOpts {
  readonly resolve?: { readonly pr: CreatedPr; readonly statusFlipFailed: boolean };
  // `unknown` because the bespoke-unwrap adapter throws raw AppError
  // objects ({ kind, message }) — not Error instances. The dialog
  // must handle both shapes.
  readonly reject?: unknown;
  readonly delay?: Promise<void>;
}

function makeWorkspaces(opts: WorkspacesOpts = {}): WorkspacesStub {
  return {
    createPr: vi.fn(async () => {
      if (opts.delay) await opts.delay;
      if (opts.reject) throw opts.reject;
      return (
        opts.resolve ?? {
          pr: { number: 1, htmlUrl: 'https://github.com/foo/bar/pull/1' },
          statusFlipFailed: false,
        }
      );
    }),
  };
}

interface MountOpts {
  readonly profile?: ProfileStub;
  readonly workspaces?: WorkspacesStub;
  readonly context?: CreatePrDialogContext;
}

function mount(opts: MountOpts = {}): {
  fixture: ComponentFixture<FeatureCreatePrDialog>;
  profile: ProfileStub;
  workspaces: WorkspacesStub;
} {
  const profile = opts.profile ?? makeProfile(true);
  const workspaces = opts.workspaces ?? makeWorkspaces();
  const ctx: CreatePrDialogContext = opts.context ?? {
    workspaceId: 'ws1',
    defaultTitle: 'Initial PR title',
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: DIALOG_DATA, useValue: ctx },
      {
        provide: BrnDialogRef,
        // hlmDialogTitle/Description directives call these on the ref
        // during change detection — stub as no-ops so the rendered
        // template doesn't blow up.
        useValue: {
          close: vi.fn(),
          setAriaLabelledBy: vi.fn(),
          setAriaDescribedBy: vi.fn(),
          setAriaLabel: vi.fn(),
        },
      },
      { provide: ProfileFacade, useValue: profile },
      { provide: WorkspacesFacade, useValue: workspaces },
    ],
  });
  const fixture = TestBed.createComponent(FeatureCreatePrDialog);
  fixture.detectChanges();
  return { fixture, profile, workspaces };
}

function buttons(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLButtonElement[] {
  return f.debugElement
    .queryAll(By.css('button[hlmBtn]'))
    .map((d) => d.nativeElement as HTMLButtonElement);
}

function submitButton(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLButtonElement {
  // Footer order: [Cancel, Create pull request]
  const all = buttons(f);
  return all[all.length - 1];
}

function alertEl(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLElement | null {
  const found = f.debugElement.query(By.css('[hlmAlert]'));
  return found ? (found.nativeElement as HTMLElement) : null;
}

function inlineErrorEl(
  f: ComponentFixture<FeatureCreatePrDialog>,
): HTMLElement | null {
  // The inline error <p class="text-xs text-destructive">{{ err }}</p>
  // lives inside the form. The createdUrl branch doesn't render an
  // error element, so a single .text-destructive query is unambiguous.
  const found = f.debugElement.query(By.css('p.text-destructive'));
  return found ? (found.nativeElement as HTMLElement) : null;
}

describe('FeatureCreatePrDialog — auth gate', () => {
  it('hides the alert and enables submit when GitHub is connected', () => {
    const { fixture } = mount();
    expect(alertEl(fixture)).toBeNull();
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('shows the alert and disables submit when GitHub is disconnected', () => {
    const { fixture } = mount({ profile: makeProfile(false) });
    const alert = alertEl(fixture);
    expect(alert?.textContent).toContain(
      'Connect your GitHub account to open this PR.',
    );
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('reactively flips when the signal mid-flows from connected to disconnected', () => {
    const { fixture, profile } = mount();
    expect(alertEl(fixture)).toBeNull();
    expect(submitButton(fixture).disabled).toBe(false);
    profile.githubConnected.set(false);
    fixture.detectChanges();
    expect(alertEl(fixture)).not.toBeNull();
    expect(submitButton(fixture).disabled).toBe(true);
  });

  it('also disables submit when the title is empty even if connected', () => {
    const { fixture } = mount({
      context: { workspaceId: 'ws1', defaultTitle: '' },
    });
    expect(submitButton(fixture).disabled).toBe(true);
  });
});

describe('FeatureCreatePrDialog — submit flow', () => {
  it('routes via workspaces.createPr with trimmed title and renders the PR URL on success', async () => {
    const { fixture, workspaces } = mount();
    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    expect(workspaces.createPr).toHaveBeenCalledWith(
      'ws1',
      'Initial PR title',
      '',
      false,
    );
    const link = fixture.debugElement.query(By.css('a[target="_blank"]'));
    expect(link).not.toBeNull();
    expect((link.nativeElement as HTMLAnchorElement).href).toBe(
      'https://github.com/foo/bar/pull/1',
    );
  });

  it('surfaces a thrown Error inline and keeps the form open for retry', async () => {
    const workspaces = makeWorkspaces({ reject: new Error('NoGithubToken') });
    const { fixture } = mount({ workspaces });
    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errEl = inlineErrorEl(fixture);
    expect(errEl?.textContent).toContain('NoGithubToken');
    // form (not the createdUrl branch) is still rendered
    expect(fixture.debugElement.query(By.css('input#pr-title'))).not.toBeNull();
    // submit becomes clickable again — user can retry after fixing
    expect(submitButton(fixture).disabled).toBe(false);
  });

  it('surfaces a thrown AppError object ({ kind, message }) inline', async () => {
    // The production adapter throws the raw AppError shape via
    // bespoke unwrap — NOT `new Error(...)`. The dialog has to read
    // `.message` from plain objects too, otherwise the inline error
    // renders as "[object Object]".
    const workspaces = makeWorkspaces({
      reject: { kind: 'NoGithubToken', message: 'GitHub token not configured' },
    });
    const { fixture } = mount({ workspaces });
    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const errEl = inlineErrorEl(fixture);
    expect(errEl?.textContent).toContain('GitHub token not configured');
    expect(errEl?.textContent).not.toContain('[object Object]');
  });

  it('guards against double-submit while one call is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workspaces = makeWorkspaces({ delay: gate });
    const { fixture } = mount({ workspaces });
    submitButton(fixture).click();
    fixture.detectChanges();
    // submitting=true → button disabled
    expect(submitButton(fixture).disabled).toBe(true);
    // a second click while in flight is a no-op
    submitButton(fixture).click();
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    release();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
  });
});

describe('FeatureCreatePrDialog — D2 partial failure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the PR URL even when statusFlipFailed=true', async () => {
    const workspaces = makeWorkspaces({
      resolve: {
        pr: { number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42' },
        statusFlipFailed: true,
      },
    });
    const { fixture } = mount({ workspaces });
    submitButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('a[target="_blank"]'));
    expect(link).not.toBeNull();
    expect((link.nativeElement as HTMLAnchorElement).href).toBe(
      'https://github.com/foo/bar/pull/42',
    );
  });
});
