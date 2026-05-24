import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import type { MergeAction } from '@mozart/desktop-workspaces-util';
import { MergeActionMenu } from './merge-action-menu';

// T11 — covers P1.1 D9 (isGithubRemote / githubConnected tooltip
// priority — informational only after the always-clickable refactor)
// and D5 (localMergeDisabled defaults + Soon badge wiring). PR
// primary + dropdown row are ALWAYS clickable; gating moved into the
// FeatureCreatePrDialog which renders an alert and disables Submit.
// Dropdown rows live inside an `<ng-template>` and only render after
// the trigger opens the overlay, so dropdown-internal state is asserted
// through the protected `prRowDisabled` / `prRowTooltip` computeds via
// a typed cast. The primary button is rendered eagerly and asserted
// against the DOM directly.

interface MountOpts {
  readonly primaryAction?: MergeAction;
  readonly githubConnected?: boolean;
  readonly isGithubRemote?: boolean;
  readonly localMergeDisabled?: boolean;
}

function mount(opts: MountOpts = {}): ComponentFixture<MergeActionMenu> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MergeActionMenu);
  fixture.componentRef.setInput('primaryAction', opts.primaryAction ?? 'pr');
  fixture.componentRef.setInput(
    'githubConnected',
    opts.githubConnected ?? true,
  );
  fixture.componentRef.setInput('isGithubRemote', opts.isGithubRemote ?? true);
  fixture.componentRef.setInput(
    'localMergeDisabled',
    opts.localMergeDisabled ?? true,
  );
  fixture.detectChanges();
  return fixture;
}

function primaryButton(
  f: ComponentFixture<MergeActionMenu>,
): HTMLButtonElement {
  const buttons = f.debugElement.queryAll(By.css('button[hlmBtn]'));
  return buttons[0].nativeElement as HTMLButtonElement;
}

interface Internals {
  readonly primaryTooltip: () => string;
  readonly prRowDisabled: () => boolean;
  readonly prRowTooltip: () => string | null;
}

function internals(f: ComponentFixture<MergeActionMenu>): Internals {
  return f.componentInstance as unknown as Internals;
}

describe('MergeActionMenu — primary button rendering', () => {
  it('renders "Create PR" when primaryAction="pr"', () => {
    const f = mount({ primaryAction: 'pr' });
    expect(primaryButton(f).textContent).toContain('Create PR');
  });

  it('renders "Merge now" when primaryAction="local"', () => {
    const f = mount({ primaryAction: 'local' });
    expect(primaryButton(f).textContent).toContain('Merge now');
  });
});

describe('MergeActionMenu — primary button gating (P1.1 D9)', () => {
  it('enabled when primaryAction="pr" + both GitHub gates open', () => {
    const f = mount({
      primaryAction: 'pr',
      githubConnected: true,
      isGithubRemote: true,
    });
    expect(primaryButton(f).disabled).toBe(false);
    expect(internals(f).primaryTooltip()).toBe('Open a pull request');
  });

  it('stays enabled with non-GitHub tooltip when !isGithubRemote (dialog gates Submit)', () => {
    const f = mount({
      primaryAction: 'pr',
      githubConnected: true,
      isGithubRemote: false,
    });
    expect(primaryButton(f).disabled).toBe(false);
    expect(internals(f).primaryTooltip()).toBe("This repo isn't on GitHub");
  });

  it('stays enabled with connect-GitHub tooltip when !githubConnected (dialog gates Submit)', () => {
    const f = mount({
      primaryAction: 'pr',
      githubConnected: false,
      isGithubRemote: true,
    });
    expect(primaryButton(f).disabled).toBe(false);
    expect(internals(f).primaryTooltip()).toBe('Connect GitHub to open PRs');
  });

  it('non-GitHub tooltip takes priority over connect-GitHub when both gates are closed', () => {
    const f = mount({
      primaryAction: 'pr',
      githubConnected: false,
      isGithubRemote: false,
    });
    expect(primaryButton(f).disabled).toBe(false);
    expect(internals(f).primaryTooltip()).toBe("This repo isn't on GitHub");
  });

  it('local primary is not gated by GitHub state but IS gated by localMergeDisabled', () => {
    const f = mount({
      primaryAction: 'local',
      githubConnected: false,
      isGithubRemote: false,
      localMergeDisabled: false,
    });
    expect(primaryButton(f).disabled).toBe(false);
    expect(internals(f).primaryTooltip()).toBe(
      'Merge this workspace into its base branch',
    );
  });

  it('local primary is disabled with "Coming soon" tooltip when localMergeDisabled=true', () => {
    // Symmetry with the dropdown Merge-now row. A
    // (primaryAction='local', localMergeDisabled=true) combo would
    // otherwise show a clickable primary while the dropdown row is
    // disabled — inconsistent gating.
    const f = mount({
      primaryAction: 'local',
      localMergeDisabled: true,
    });
    expect(primaryButton(f).disabled).toBe(true);
    expect(internals(f).primaryTooltip()).toBe('Coming soon');
  });
});

describe('MergeActionMenu — pick output', () => {
  it('emits pick=primaryAction when primary is clicked while enabled', () => {
    const f = mount({ primaryAction: 'pr' });
    const picks: MergeAction[] = [];
    f.componentInstance.pick.subscribe((a) => picks.push(a));
    primaryButton(f).click();
    expect(picks).toEqual(['pr']);
  });

  it('emits pick="pr" even when GitHub gates are closed (dialog explains)', () => {
    const f = mount({ primaryAction: 'pr', isGithubRemote: false });
    const picks: MergeAction[] = [];
    f.componentInstance.pick.subscribe((a) => picks.push(a));
    primaryButton(f).click();
    expect(picks).toEqual(['pr']);
  });

  it('does not emit for primaryAction="local" while localMergeDisabled', () => {
    const f = mount({ primaryAction: 'local', localMergeDisabled: true });
    const picks: MergeAction[] = [];
    f.componentInstance.pick.subscribe((a) => picks.push(a));
    primaryButton(f).click();
    expect(picks).toEqual([]);
  });
});

describe('MergeActionMenu — dropdown PR row gating (P1.1 D9)', () => {
  it('enabled when both gates open, no tooltip', () => {
    const f = mount({ githubConnected: true, isGithubRemote: true });
    expect(internals(f).prRowDisabled()).toBe(false);
    expect(internals(f).prRowTooltip()).toBeNull();
  });

  it('stays enabled with non-GitHub tooltip when !isGithubRemote (dialog gates Submit)', () => {
    const f = mount({ githubConnected: true, isGithubRemote: false });
    expect(internals(f).prRowDisabled()).toBe(false);
    expect(internals(f).prRowTooltip()).toBe("This repo isn't on GitHub");
  });

  it('stays enabled with connect-GitHub tooltip when !githubConnected (dialog gates Submit)', () => {
    const f = mount({ githubConnected: false, isGithubRemote: true });
    expect(internals(f).prRowDisabled()).toBe(false);
    expect(internals(f).prRowTooltip()).toBe('Connect GitHub to open PRs');
  });

  it('row stays clickable regardless of primaryAction (tooltip still reflects state)', () => {
    const f = mount({
      primaryAction: 'local',
      githubConnected: false,
      isGithubRemote: false,
    });
    expect(internals(f).prRowDisabled()).toBe(false);
    expect(internals(f).prRowTooltip()).toBe("This repo isn't on GitHub");
  });
});

describe('MergeActionMenu — localMergeDisabled (P1.1 D5)', () => {
  it('defaults to true', () => {
    const f = mount();
    expect(f.componentInstance.localMergeDisabled()).toBe(true);
  });

  it('reflects the input override', () => {
    const f = mount({ localMergeDisabled: false });
    expect(f.componentInstance.localMergeDisabled()).toBe(false);
  });
});
