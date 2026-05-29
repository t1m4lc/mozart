import {
  provideZonelessChangeDetection,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { HlmDialogService } from '@spartan-ui/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import {
  ProjectsFacade,
  type GithubRemoteStatus,
} from '@mozart/desktop-projects-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import {
  WorkspacesFacade,
  type CreatedPr,
} from '@mozart/desktop-workspaces-data-access';
import type { WorkspacePr } from '@mozart/desktop-workspaces-util';
import {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';

// Mock the profile-feature dynamic import so the Connect-GitHub CTA
// test doesn't try to load the real Spartan-heavy chunk in jsdom.
vi.mock('@mozart/desktop-profile-feature', () => ({
  UiGithubConnectDialog: class FakeUiGithubConnectDialog {},
}));

// Covers the explicit-state PR dialog: precise remote messaging
// (no-remote / non-GitHub), the not-connected Connect CTA, the
// commit-all-and-create flow for a dirty tree, the success /
// already-has-PR "Open in GitHub" state, and error handling. The github
// REMOTE PARSING itself is unit-tested in Rust (github.rs); here we
// test the front-end flow given a resolved status.

const GH_REMOTE: GithubRemoteStatus = {
  kind: 'github',
  owner: 'foo',
  repo: 'bar',
  remoteName: 'origin',
};

interface ProfileStub {
  readonly githubConnected: WritableSignal<boolean>;
  readonly githubLogin: Signal<string | null>;
  readonly githubKind: Signal<string | null>;
}

interface WorkspacesStub {
  readonly createPr: ReturnType<typeof vi.fn>;
  readonly commitWorkspace: ReturnType<typeof vi.fn>;
  readonly workspaceById: (
    id: string,
  ) => () => {
    projectId: string;
    baseBranch: string;
    pr: WorkspacePr | null;
  } | null;
}

interface RepositoriesStub {
  readonly listChangedFiles: ReturnType<typeof vi.fn>;
}

interface ProjectsStub {
  readonly status: WritableSignal<GithubRemoteStatus | null>;
  readonly githubRemoteStatusFor: (id: string) => () => GithubRemoteStatus | null;
  readonly ensureGithubRemoteStatus: ReturnType<typeof vi.fn>;
}

interface DialogServiceStub {
  readonly open: ReturnType<typeof vi.fn>;
}

interface ExternalLinkStub {
  readonly openExternal: ReturnType<typeof vi.fn>;
}

function makeProfile(connected = true): ProfileStub {
  return {
    githubConnected: signal(connected),
    githubLogin: signal(null),
    githubKind: signal(null),
  };
}

function makeProjects(status: GithubRemoteStatus | null = GH_REMOTE): ProjectsStub {
  const sig = signal<GithubRemoteStatus | null>(status);
  return {
    status: sig,
    githubRemoteStatusFor: () => () => sig(),
    ensureGithubRemoteStatus: vi.fn(async () => sig() ?? { kind: 'no-remote' }),
  };
}

function makeRepositories(
  files: readonly { path: string }[] = [],
): RepositoriesStub {
  return {
    listChangedFiles: vi.fn(async () => files),
  };
}

interface WorkspacesOpts {
  readonly resolve?: { readonly pr: CreatedPr; readonly statusFlipFailed: boolean };
  readonly reject?: unknown;
  readonly delay?: Promise<void>;
  readonly existingPr?: WorkspacePr | null;
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
    commitWorkspace: vi.fn(async () => ({ sha: 'abc123', statusFlipFailed: false })),
    workspaceById: () => () => ({
      projectId: 'proj1',
      baseBranch: 'main',
      pr: opts.existingPr ?? null,
    }),
  };
}

function makeDialogService(): DialogServiceStub {
  return { open: vi.fn() };
}

function makeExternalLink(): ExternalLinkStub {
  return { openExternal: vi.fn(async () => undefined) };
}

interface MountOpts {
  readonly profile?: ProfileStub;
  readonly workspaces?: WorkspacesStub;
  readonly projects?: ProjectsStub;
  readonly repositories?: RepositoriesStub;
  readonly dialogService?: DialogServiceStub;
  readonly externalLink?: ExternalLinkStub;
  readonly context?: CreatePrDialogContext;
}

interface Mounted {
  fixture: ComponentFixture<FeatureCreatePrDialog>;
  profile: ProfileStub;
  workspaces: WorkspacesStub;
  projects: ProjectsStub;
  repositories: RepositoriesStub;
  dialogService: DialogServiceStub;
  externalLink: ExternalLinkStub;
}

// Async: the working-tree probe (`listChangedFiles`) resolves on a
// microtask, so we settle it before asserting any post-`checking` state.
async function mount(opts: MountOpts = {}): Promise<Mounted> {
  const profile = opts.profile ?? makeProfile(true);
  const workspaces = opts.workspaces ?? makeWorkspaces();
  const projects = opts.projects ?? makeProjects(GH_REMOTE);
  const repositories = opts.repositories ?? makeRepositories();
  const dialogService = opts.dialogService ?? makeDialogService();
  const externalLink = opts.externalLink ?? makeExternalLink();
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
      { provide: RepositoriesFacade, useValue: repositories },
      { provide: HlmDialogService, useValue: dialogService },
      { provide: ExternalLinkService, useValue: externalLink },
    ],
  });
  const fixture = TestBed.createComponent(FeatureCreatePrDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    profile,
    workspaces,
    projects,
    repositories,
    dialogService,
    externalLink,
  };
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

describe('FeatureCreatePrDialog — needs-remote (precise messaging)', () => {
  it('no-remote: shows the add-a-remote guidance and blocks submit', async () => {
    const { fixture } = await mount({ projects: makeProjects({ kind: 'no-remote' }) });
    expect(alertEl(fixture)?.textContent).toContain('no Git remote configured');
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(true);
  });

  it('non-github: names the actual remote URL', async () => {
    const { fixture } = await mount({
      projects: makeProjects({
        kind: 'non-github',
        url: 'https://gitlab.com/o/r.git',
        remoteName: 'origin',
      }),
    });
    expect(alertEl(fixture)?.textContent).toContain('https://gitlab.com/o/r.git');
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(true);
  });

  it('needs-remote takes priority over not-connected (repo-level blocker)', async () => {
    const { fixture } = await mount({
      profile: makeProfile(false),
      projects: makeProjects({ kind: 'no-remote' }),
    });
    expect(alertEl(fixture)?.textContent).toContain('no Git remote configured');
  });

  it('kicks ensureGithubRemoteStatus on mount', async () => {
    const projects = makeProjects(GH_REMOTE);
    await mount({ projects });
    expect(projects.ensureGithubRemoteStatus).toHaveBeenCalledWith('proj1');
  });
});

describe('FeatureCreatePrDialog — needs-github-auth', () => {
  it('github remote + disconnected: shows Connect CTA, disables submit, no remote alert', async () => {
    const { fixture } = await mount({
      profile: makeProfile(false),
      projects: makeProjects(GH_REMOTE),
    });
    expect(alertEl(fixture)).toBeNull();
    expect(buttonByText(fixture, 'Connect GitHub')).not.toBeNull();
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(true);
  });

  it('Connect button opens the UiGithubConnectDialog', async () => {
    const dialogService = makeDialogService();
    const { fixture } = await mount({
      profile: makeProfile(false),
      projects: makeProjects(GH_REMOTE),
      dialogService,
    });
    const instance = fixture.componentInstance as unknown as {
      openConnectGithub: () => Promise<void>;
    };
    await instance.openConnectGithub();
    expect(dialogService.open).toHaveBeenCalledTimes(1);
  });

  it('reactively enables submit when githubConnected flips true', async () => {
    const profile = makeProfile(false);
    const { fixture } = await mount({ profile, projects: makeProjects(GH_REMOTE) });
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(true);
    profile.githubConnected.set(true);
    fixture.detectChanges();
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(false);
  });
});

describe('FeatureCreatePrDialog — ready state', () => {
  it('renders the resolved title and an enabled "Open pull request"', async () => {
    const { fixture } = await mount();
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('My workspace');
  });

  it('routes via workspaces.createPr with the auto title and shows Open-in-GitHub on success', async () => {
    const { fixture, workspaces, externalLink } = await mount();
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.createPr).toHaveBeenCalledWith('ws1', 'My workspace', '', false);
    const openBtn = buttonByText(fixture, 'Open in GitHub');
    expect(openBtn).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pull request opened.');
    openBtn?.click();
    expect(externalLink.openExternal).toHaveBeenCalledWith(
      'https://github.com/foo/bar/pull/1',
    );
  });

  it('does NOT auto-open the browser after creating the PR', async () => {
    const { fixture, externalLink } = await mount();
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    // Success rendered, but the browser only opens on explicit click.
    expect(externalLink.openExternal).not.toHaveBeenCalled();
  });

  it('falls back to a generic title when ctx.defaultTitle is empty', async () => {
    const { fixture, workspaces } = await mount({
      context: { workspaceId: 'ws1', defaultTitle: '' },
    });
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
    const { fixture } = await mount({ workspaces });
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(inlineErrorEl(fixture)?.textContent).toContain('NoGithubToken');
    expect(buttonByText(fixture, 'Open pull request')?.disabled).toBe(false);
  });

  it('surfaces a thrown AppError object ({ kind, message }) inline', async () => {
    const workspaces = makeWorkspaces({
      reject: { kind: 'NoGithubToken', message: 'GitHub token not configured' },
    });
    const { fixture } = await mount({ workspaces });
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
    const { fixture } = await mount({ workspaces });
    clickByText(fixture, 'Open pull request');
    fixture.detectChanges();
    const pending = buttonByText(fixture, 'Pushing & opening PR…');
    expect(pending).not.toBeNull();
    expect(pending?.disabled).toBe(true);
    clickByText(fixture, 'Pushing & opening PR…');
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    deferred.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
  });
});

describe('FeatureCreatePrDialog — needs-commit (commit-all flow)', () => {
  it('dirty tree: shows a prefilled commit message + "Commit all & create PR"', async () => {
    const { fixture } = await mount({
      repositories: makeRepositories([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]),
    });
    expect(buttonByText(fixture, 'Commit all & create PR')).not.toBeNull();
    const input = fixture.debugElement.query(By.css('input[hlmInput]'));
    expect(input).not.toBeNull();
    expect((input.nativeElement as HTMLInputElement).value).toBe('My workspace');
  });

  it('commits all changed paths, then creates the PR', async () => {
    const workspaces = makeWorkspaces();
    const { fixture } = await mount({
      workspaces,
      repositories: makeRepositories([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]),
    });
    clickByText(fixture, 'Commit all & create PR');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspaces.commitWorkspace).toHaveBeenCalledWith(
      'ws1',
      ['src/a.ts', 'src/b.ts'],
      'My workspace',
    );
    expect(workspaces.createPr).toHaveBeenCalledTimes(1);
    expect(buttonByText(fixture, 'Open in GitHub')).not.toBeNull();
  });
});

describe('FeatureCreatePrDialog — already-has-pr', () => {
  it('shows Open-in-GitHub immediately when the workspace already has a PR', async () => {
    const workspaces = makeWorkspaces({
      existingPr: { url: 'https://github.com/foo/bar/pull/9', number: 9, state: 'open' },
    });
    const { fixture, externalLink } = await mount({ workspaces });
    expect(fixture.nativeElement.textContent).toContain(
      'A pull request is already open',
    );
    expect(fixture.nativeElement.textContent).toContain('#9');
    expect(buttonByText(fixture, 'Open pull request')).toBeNull();
    clickByText(fixture, 'Open in GitHub');
    expect(externalLink.openExternal).toHaveBeenCalledWith(
      'https://github.com/foo/bar/pull/9',
    );
    // Never attempts to create another PR.
    expect(workspaces.createPr).not.toHaveBeenCalled();
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

  it('renders the success state even when statusFlipFailed=true', async () => {
    const workspaces = makeWorkspaces({
      resolve: {
        pr: { number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42' },
        statusFlipFailed: true,
      },
    });
    const { fixture, externalLink } = await mount({ workspaces });
    clickByText(fixture, 'Open pull request');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('#42');
    clickByText(fixture, 'Open in GitHub');
    expect(externalLink.openExternal).toHaveBeenCalledWith(
      'https://github.com/foo/bar/pull/42',
    );
  });
});
