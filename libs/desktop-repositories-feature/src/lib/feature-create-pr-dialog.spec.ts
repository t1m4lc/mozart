import {
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '@spartan-ui/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import {
  WorkspacesFacade,
  type CreatedPr,
} from '@mozart/desktop-workspaces-data-access';
import {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';

// Mock the profile-feature dynamic import so the Connect-GitHub CTA
// test doesn't try to load the real Spartan-heavy chunk in jsdom.
vi.mock('@mozart/desktop-profile-feature', () => ({
  UiGithubConnectDialog: class FakeUiGithubConnectDialog {},
}));

// Covers the three-state PR dialog (Phase 4f-ish refactor): the
// no-remote guidance, the not-connected Connect-GitHub CTA, and the
// ready state's single-button "Open pull request" flow. Inputs (title,
// body, draft) were removed in favor of an auto-title sourced from
// ctx.defaultTitle. ProfileFacade, ProjectsFacade, WorkspacesFacade,
// and HlmDialogService are stubbed with the smallest plausible shapes.

interface ProfileStub {
  readonly githubConnected: WritableSignal<boolean>;
}

interface WorkspacesStub {
  readonly createPr: ReturnType<typeof vi.fn>;
  readonly workspaceById: (id: string) => () => { projectId: string } | null;
}

interface ProjectsStub {
  readonly isGithubRemote: WritableSignal<boolean | null>;
  readonly isGithubRemoteFor: (id: string) => () => boolean | null;
  readonly ensureIsGithubRemote: ReturnType<typeof vi.fn>;
}

interface DialogServiceStub {
  readonly open: ReturnType<typeof vi.fn>;
}

function makeProfile(connected = true): ProfileStub {
  return { githubConnected: signal(connected) };
}

function makeProjects(isGithubRemote: boolean | null = true): ProjectsStub {
  const sig = signal<boolean | null>(isGithubRemote);
  return {
    isGithubRemote: sig,
    isGithubRemoteFor: () => () => sig(),
    ensureIsGithubRemote: vi.fn(async () => sig() ?? false),
  };
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
    workspaceById: () => () => ({ projectId: 'proj1' }),
  };
}

function makeDialogService(): DialogServiceStub {
  return { open: vi.fn() };
}

interface MountOpts {
  readonly profile?: ProfileStub;
  readonly workspaces?: WorkspacesStub;
  readonly projects?: ProjectsStub;
  readonly dialogService?: DialogServiceStub;
  readonly context?: CreatePrDialogContext;
}

function mount(opts: MountOpts = {}): {
  fixture: ComponentFixture<FeatureCreatePrDialog>;
  profile: ProfileStub;
  workspaces: WorkspacesStub;
  projects: ProjectsStub;
  dialogService: DialogServiceStub;
} {
  const profile = opts.profile ?? makeProfile(true);
  const workspaces = opts.workspaces ?? makeWorkspaces();
  const projects = opts.projects ?? makeProjects(true);
  const dialogService = opts.dialogService ?? makeDialogService();
  const ctx: CreatePrDialogContext = opts.context ?? {
    workspaceId: 'ws1',
    defaultTitle: 'My workspace',
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
      { provide: ProjectsFacade, useValue: projects },
      { provide: HlmDialogService, useValue: dialogService },
    ],
  });
  const fixture = TestBed.createComponent(FeatureCreatePrDialog);
  fixture.detectChanges();
  return { fixture, profile, workspaces, projects, dialogService };
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
  return (
    buttons(f).find((b) => b.textContent?.trim().includes(text)) ?? null
  );
}

// Click helper that fails the test with a clear message instead of
// allowing a `!` non-null assertion (lint forbids those in specs).
function clickByText(
  f: ComponentFixture<FeatureCreatePrDialog>,
  text: string,
): void {
  const btn = buttonByText(f, text);
  if (!btn) throw new Error(`button containing "${text}" not found`);
  btn.click();
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
  const found = f.debugElement.query(By.css('p.text-destructive'));
  return found ? (found.nativeElement as HTMLElement) : null;
}

describe('FeatureCreatePrDialog — no-remote state (priority over not-connected)', () => {
  it('shows guidance and only a Close button when isGithubRemote=false', () => {
    const { fixture } = mount({
      profile: makeProfile(false),
      projects: makeProjects(false),
    });
    expect(alertEl(fixture)?.textContent).toContain(
      "doesn't have a GitHub remote",
    );
    // No "Open pull request" button rendered.
    expect(buttonByText(fixture, 'Open pull request')).toBeNull();
    // No "Connect GitHub" CTA rendered either — no-remote takes priority.
    expect(buttonByText(fixture, 'Connect GitHub')).toBeNull();
    expect(buttonByText(fixture, 'Close')).not.toBeNull();
  });

  it('treats isGithubRemote=null (probe pending) as no-remote', () => {
    const { fixture } = mount({ projects: makeProjects(null) });
    expect(alertEl(fixture)?.textContent).toContain(
      "doesn't have a GitHub remote",
    );
  });

  it('kicks ensureIsGithubRemote on mount', () => {
    const projects = makeProjects(true);
    mount({ projects });
    expect(projects.ensureIsGithubRemote).toHaveBeenCalledWith('proj1');
  });
});

describe('FeatureCreatePrDialog — not-connected state', () => {
  it('shows the Connect-GitHub CTA when remote=true but disconnected', () => {
    const { fixture } = mount({
      profile: makeProfile(false),
      projects: makeProjects(true),
    });
    expect(alertEl(fixture)?.textContent).toContain(
      'GitHub personal access token',
    );
    expect(buttonByText(fixture, 'Connect GitHub')).not.toBeNull();
    // The "Open pull request" button is NOT rendered in this state.
    expect(buttonByText(fixture, 'Open pull request')).toBeNull();
  });

  it('Connect-GitHub button opens the UiGithubConnectDialog via the dialog service', async () => {
    const dialogService = makeDialogService();
    const { fixture } = mount({
      profile: makeProfile(false),
      projects: makeProjects(true),
      dialogService,
    });
    expect(buttonByText(fixture, 'Connect GitHub')).not.toBeNull();
    // Drive openConnectGithub() directly: the click → handler chain
    // wraps a dynamic import whose Promise can't be awaited via
    // fixture.whenStable in jsdom (no Angular zones tracking).
    const instance = fixture.componentInstance as unknown as {
      openConnectGithub: () => Promise<void>;
    };
    await instance.openConnectGithub();
    expect(dialogService.open).toHaveBeenCalledTimes(1);
  });

  it('reactively flips to the ready state when githubConnected goes true', () => {
    const profile = makeProfile(false);
    const { fixture } = mount({ profile, projects: makeProjects(true) });
    expect(buttonByText(fixture, 'Open pull request')).toBeNull();
    profile.githubConnected.set(true);
    fixture.detectChanges();
    expect(buttonByText(fixture, 'Open pull request')).not.toBeNull();
    expect(alertEl(fixture)).toBeNull();
  });
});

describe('FeatureCreatePrDialog — ready state (no inputs, auto-title)', () => {
  it('renders the "Open pull request" button and the resolved title', () => {
    const { fixture } = mount();
    expect(buttonByText(fixture, 'Open pull request')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('My workspace');
  });

  it('does NOT render title, body, or draft inputs', () => {
    const { fixture } = mount();
    expect(fixture.debugElement.query(By.css('input#pr-title'))).toBeNull();
    expect(fixture.debugElement.query(By.css('textarea#pr-body'))).toBeNull();
    expect(
      fixture.debugElement.query(By.css('input[type="checkbox"]')),
    ).toBeNull();
  });

  it('routes via workspaces.createPr with the auto-derived title and renders the PR URL on success', async () => {
    const { fixture, workspaces } = mount();
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    expect(workspaces.createPr).toHaveBeenCalledWith(
      'ws1',
      'My workspace',
      '',
      false,
    );
    const link = fixture.debugElement.query(By.css('a[target="_blank"]'));
    expect(link).not.toBeNull();
    expect((link.nativeElement as HTMLAnchorElement).href).toBe(
      'https://github.com/foo/bar/pull/1',
    );
  });

  it('falls back to a generic title when ctx.defaultTitle is empty', async () => {
    const { fixture, workspaces } = mount({
      context: { workspaceId: 'ws1', defaultTitle: '' },
    });
    expect(fixture.nativeElement.textContent).toContain('Mozart pull request');
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    expect(workspaces.createPr).toHaveBeenCalledWith(
      'ws1',
      'Mozart pull request',
      '',
      false,
    );
  });

  it('surfaces a thrown Error inline and keeps the form open for retry', async () => {
    const workspaces = makeWorkspaces({ reject: new Error('NoGithubToken') });
    const { fixture } = mount({ workspaces });
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    const errEl = inlineErrorEl(fixture);
    expect(errEl?.textContent).toContain('NoGithubToken');
    // "Open pull request" is back to clickable for retry
    const btn = buttonByText(fixture, 'Open pull request');
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
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
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    const errEl = inlineErrorEl(fixture);
    expect(errEl?.textContent).toContain('GitHub token not configured');
    expect(errEl?.textContent).not.toContain('[object Object]');
  });

  it('guards against double-submit while one call is in flight', async () => {
    const deferred = makeDeferred();
    const workspaces = makeWorkspaces({ delay: deferred.promise });
    const { fixture } = mount({ workspaces });
    clickByText(fixture, 'Open pull request');
    fixture.detectChanges();
    // submitting=true → button label flips and is disabled
    const pending = buttonByText(fixture, 'Pushing & creating…');
    expect(pending).not.toBeNull();
    expect(pending?.disabled).toBe(true);
    // a second click while in flight is a no-op
    clickByText(fixture, 'Pushing & creating…');
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    deferred.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
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
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    const link = fixture.debugElement.query(By.css('a[target="_blank"]'));
    expect(link).not.toBeNull();
    expect((link.nativeElement as HTMLAnchorElement).href).toBe(
      'https://github.com/foo/bar/pull/42',
    );
  });
});
