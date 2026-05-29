import { describe, expect, it } from 'vitest';
import type { GithubRemoteStatus } from '@mozart/desktop-projects-data-access';
import { decidePrAction } from './pr-flow.decide';

const github: GithubRemoteStatus = {
  kind: 'github',
  owner: 'o',
  repo: 'r',
  remoteName: 'origin',
};

describe('decidePrAction', () => {
  it('not connected → connect (even with a dirty tree)', () => {
    expect(
      decidePrAction({ connected: false, remote: github, changedPaths: ['a.ts'], hasBranchChanges: true }),
    ).toEqual({ kind: 'connect' });
  });

  it('connected but no-remote → blocked-remote', () => {
    const d = decidePrAction({
      connected: true,
      remote: { kind: 'no-remote' },
      changedPaths: [],
      hasBranchChanges: false,
    });
    expect(d.kind).toBe('blocked-remote');
    if (d.kind === 'blocked-remote') expect(d.message).toContain('no Git remote');
  });

  it('connected but non-github → blocked-remote names the url', () => {
    const d = decidePrAction({
      connected: true,
      remote: { kind: 'non-github', url: 'https://gitlab.com/o/r.git', remoteName: 'origin' },
      changedPaths: [],
      hasBranchChanges: false,
    });
    expect(d.kind).toBe('blocked-remote');
    if (d.kind === 'blocked-remote') expect(d.message).toContain('gitlab.com');
  });

  it('connected, remote read error → blocked-remote surfaces the message', () => {
    const d = decidePrAction({
      connected: true,
      remote: { kind: 'error', message: 'boom' },
      changedPaths: [],
      hasBranchChanges: false,
    });
    expect(d.kind).toBe('blocked-remote');
    if (d.kind === 'blocked-remote') expect(d.message).toContain('boom');
  });

  it('connected, null remote (probe failed/pending) → blocked-remote fallback', () => {
    const d = decidePrAction({ connected: true, remote: null, changedPaths: [], hasBranchChanges: false });
    expect(d.kind).toBe('blocked-remote');
  });

  it('connected + github + no branch changes → no-changes', () => {
    expect(
      decidePrAction({ connected: true, remote: github, changedPaths: [], hasBranchChanges: false }),
    ).toEqual({ kind: 'no-changes' });
  });

  it('connected + github + dirty → commit with the paths', () => {
    expect(
      decidePrAction({
        connected: true,
        remote: github,
        changedPaths: ['a.ts', 'b.ts'],
        hasBranchChanges: true,
      }),
    ).toEqual({ kind: 'commit', paths: ['a.ts', 'b.ts'] });
  });

  it('connected + github + clean tree but commits ahead → create', () => {
    expect(
      decidePrAction({ connected: true, remote: github, changedPaths: [], hasBranchChanges: true }),
    ).toEqual({ kind: 'create' });
  });
});
