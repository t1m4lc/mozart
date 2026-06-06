import {
  groupSkills,
  mergeSkillCatalogs,
  runsOn,
  visibleSkills,
} from './selectors';
import type { SkillDescriptor } from './skill.model';

const mk = (
  id: string,
  runtimes: SkillDescriptor['runtimes'],
  source: SkillDescriptor['source'],
  availability: SkillDescriptor['availability'] = 'available',
): SkillDescriptor => ({
  id,
  label: id,
  description: id,
  runtimes,
  source,
  scope: 'global',
  availability,
});

const mozartA = mk('explain', 'any', { kind: 'mozart' });
const mozartB = mk('summarize', 'any', { kind: 'mozart' });
const claude = mk('review', ['claude'], {
  kind: 'builtin',
  publisher: 'claude',
});
const codex = mk('codex-review', ['codex'], {
  kind: 'builtin',
  publisher: 'codex',
});
const market = mk(
  'ship',
  'any',
  { kind: 'marketplace', publisher: 'gstack' },
  'coming_soon',
);
const catalog = [mozartA, mozartB, claude, codex, market];

describe('runsOn', () => {
  it('agnostic skills run on any runtime', () => {
    expect(runsOn(mozartA, 'claude')).toBe(true);
    expect(runsOn(mozartA, 'codex')).toBe(true);
  });
  it('provider-specific skill runs only on its runtime', () => {
    expect(runsOn(claude, 'claude')).toBe(true);
    expect(runsOn(claude, 'codex')).toBe(false);
  });
});

describe('visibleSkills', () => {
  it('default mode shows agnostic + current runtime (Claude)', () => {
    const out = visibleSkills(catalog, { activeRuntime: 'claude' });
    expect(out.map((s) => s.id)).toEqual([
      'explain',
      'summarize',
      'review',
      'ship',
    ]);
  });
  it('default mode hides the other provider (Codex hidden under Claude)', () => {
    const out = visibleSkills(catalog, { activeRuntime: 'claude' });
    expect(out).not.toContain(codex);
  });
  it('default mode under Codex shows agnostic + codex, hides claude', () => {
    const out = visibleSkills(catalog, { activeRuntime: 'codex' });
    expect(out.map((s) => s.id)).toEqual([
      'explain',
      'summarize',
      'codex-review',
      'ship',
    ]);
  });
  it("'current' mode shows only provider-specific skills, excludes agnostic", () => {
    const out = visibleSkills(catalog, {
      activeRuntime: 'claude',
      filterMode: 'current',
    });
    expect(out.map((s) => s.id)).toEqual(['review']);
  });
  it("'all' mode shows everything regardless of runtime", () => {
    const out = visibleSkills(catalog, {
      activeRuntime: 'claude',
      filterMode: 'all',
    });
    expect(out).toHaveLength(catalog.length);
  });
  it('keeps coming_soon skills (rendered disabled, not dropped)', () => {
    const out = visibleSkills(catalog, { activeRuntime: 'claude' });
    expect(out).toContain(market);
  });
});

describe('groupSkills', () => {
  it('Mozart group sorts first, then provider builtins, then marketplace', () => {
    const groups = groupSkills(catalog);
    expect(groups.map((g) => g.label)).toEqual([
      'Mozart',
      'Claude',
      'Codex',
      'Gstack',
    ]);
  });
  it('preserves catalog order within a group', () => {
    const groups = groupSkills(catalog);
    const mozart = groups.find((g) => g.key === 'mozart');
    expect(mozart?.skills.map((s) => s.id)).toEqual(['explain', 'summarize']);
  });
  it('splits builtins into one group per publisher', () => {
    const groups = groupSkills(catalog);
    expect(groups.find((g) => g.key === 'claude')?.skills).toEqual([claude]);
    expect(groups.find((g) => g.key === 'codex')?.skills).toEqual([codex]);
  });
});

describe('mergeSkillCatalogs', () => {
  it('drops the agnostic skill repeated across provider scans', () => {
    // Each provider scan returns its own skills + the shared Mozart ones.
    const claudeScan = [mozartA, claude];
    const codexScan = [mozartA, codex];
    const merged = mergeSkillCatalogs([claudeScan, codexScan]);
    expect(merged.map((s) => s.id)).toEqual([
      'explain',
      'review',
      'codex-review',
    ]);
  });

  it('keeps same-id skills from different publishers distinct', () => {
    const claudeShip = mk('ship', ['claude'], {
      kind: 'builtin',
      publisher: 'claude',
    });
    const codexShip = mk('ship', ['codex'], {
      kind: 'builtin',
      publisher: 'codex',
    });
    const merged = mergeSkillCatalogs([[claudeShip], [codexShip]]);
    expect(merged).toEqual([claudeShip, codexShip]);
  });
});
