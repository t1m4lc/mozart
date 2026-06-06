import { skillToDescriptor, type DiscoveredSkill } from './skill.map';

const mk = (over: Partial<DiscoveredSkill> = {}): DiscoveredSkill => ({
  id: 'commit',
  name: 'Commit',
  description: 'conventional commit',
  source: 'mozart-project',
  runtime: 'any',
  publisher: null,
  scope: 'project',
  ...over,
});

describe('skillToDescriptor', () => {
  it('maps mozart-project → mozart source, agnostic runtimes', () => {
    const d = skillToDescriptor(mk());
    expect(d.source).toEqual({ kind: 'mozart' });
    expect(d.runtimes).toBe('any');
  });

  it('maps claude-provider → builtin/claude, claude runtime', () => {
    const d = skillToDescriptor(
      mk({ source: 'claude-provider', runtime: 'claude' }),
    );
    expect(d.source).toEqual({ kind: 'builtin', publisher: 'claude' });
    expect(d.runtimes).toEqual(['claude']);
  });

  it('maps codex-provider → builtin/codex, codex runtime', () => {
    const d = skillToDescriptor(
      mk({ source: 'codex-provider', runtime: 'codex' }),
    );
    expect(d.source).toEqual({ kind: 'builtin', publisher: 'codex' });
    expect(d.runtimes).toEqual(['codex']);
  });

  it('keeps a provider publisher (gstack under ~/.claude) as the group key', () => {
    const d = skillToDescriptor(
      mk({ source: 'claude-provider', runtime: 'claude', publisher: 'gstack' }),
    );
    expect(d.source).toEqual({ kind: 'builtin', publisher: 'gstack' });
  });

  it('uses name for the label and passes id/description through', () => {
    const d = skillToDescriptor(mk({ id: 'commit', name: 'Commit' }));
    expect(d.id).toBe('commit');
    expect(d.label).toBe('Commit');
    expect(d.description).toBe('conventional commit');
  });

  it('passes scope through', () => {
    expect(skillToDescriptor(mk({ scope: 'global' })).scope).toBe('global');
    expect(skillToDescriptor(mk({ scope: 'project' })).scope).toBe('project');
  });

  it('discovered skills are always available, no category', () => {
    const d = skillToDescriptor(mk());
    expect(d.availability).toBe('available');
    expect(d.category).toBeUndefined();
  });

  it('throws on an unknown wire variant instead of dropping silently', () => {
    expect(() =>
      skillToDescriptor(mk({ source: 'mystery-provider' as never })),
    ).toThrow(/unhandled skill enum variant/);
  });
});
