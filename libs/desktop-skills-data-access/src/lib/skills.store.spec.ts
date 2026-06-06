import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredSkill } from '@mozart/desktop-skills-util';
import { SKILLS_PORT, SkillsStore, type SkillsPort } from './skills.store';

const wire = (over: Partial<DiscoveredSkill> = {}): DiscoveredSkill => ({
  id: 'commit',
  name: 'Commit',
  description: 'conventional commit',
  source: 'mozart-project',
  runtime: 'any',
  publisher: null,
  scope: 'project',
  ...over,
});

function makeStore(port: SkillsPort): SkillsStore {
  TestBed.configureTestingModule({
    providers: [{ provide: SKILLS_PORT, useValue: port }],
  });
  return TestBed.inject(SkillsStore);
}

describe('SkillsStore', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('skillsFor is empty before any load', () => {
    const store = makeStore({ list: vi.fn().mockResolvedValue([]) });
    expect(store.skillsFor('claude', 'p1')).toEqual([]);
    expect(store.stateFor('claude', 'p1').status).toBe('idle');
  });

  it('load fetches and maps wire skills to descriptors', async () => {
    const store = makeStore({ list: vi.fn().mockResolvedValue([wire()]) });
    await store.load('claude', 'p1');
    const out = store.skillsFor('claude', 'p1');
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Commit');
    expect(out[0].source).toEqual({ kind: 'mozart' });
    expect(store.stateFor('claude', 'p1').status).toBe('loaded');
  });

  it('passes provider + projectId through to the port', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const store = makeStore({ list });
    await store.load('codex', 'proj-42');
    expect(list).toHaveBeenCalledWith('codex', 'proj-42');
  });

  it('load is a no-op once cached (scans once per scope)', async () => {
    const list = vi.fn().mockResolvedValue([wire()]);
    const store = makeStore({ list });
    await store.load('claude', 'p1');
    await store.load('claude', 'p1');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent in-flight loads', async () => {
    const list = vi.fn().mockResolvedValue([wire()]);
    const store = makeStore({ list });
    await Promise.all([store.load('claude', 'p1'), store.load('claude', 'p1')]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('caches each (provider, project) scope independently', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([wire({ id: 'a' })])
      .mockResolvedValueOnce([wire({ id: 'b' })])
      .mockResolvedValueOnce([wire({ id: 'c' })]);
    const store = makeStore({ list });
    await store.load('claude', 'p1');
    await store.load('codex', 'p1'); // different provider, same project
    await store.load('claude', null); // no project
    expect(store.skillsFor('claude', 'p1').map((s) => s.id)).toEqual(['a']);
    expect(store.skillsFor('codex', 'p1').map((s) => s.id)).toEqual(['b']);
    expect(store.skillsFor('claude', null).map((s) => s.id)).toEqual(['c']);
  });

  it('records an error and retries on the next load', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('scan boom'))
      .mockResolvedValueOnce([wire()]);
    const store = makeStore({ list });
    await store.load('claude', 'p1');
    expect(store.stateFor('claude', 'p1').status).toBe('error');
    expect(store.stateFor('claude', 'p1').error).toBe('scan boom');
    await store.load('claude', 'p1');
    expect(list).toHaveBeenCalledTimes(2);
    expect(store.stateFor('claude', 'p1').status).toBe('loaded');
  });

  it('refresh re-scans even when cached', async () => {
    const list = vi.fn().mockResolvedValue([wire()]);
    const store = makeStore({ list });
    await store.load('claude', 'p1');
    await store.refresh('claude', 'p1');
    expect(list).toHaveBeenCalledTimes(2);
  });
});
