import {
  DEFAULT_CODEX_MODEL_ID,
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  cliModelFor,
  defaultModelIdForProvider,
} from './providers.config';

describe('Codex model catalog', () => {
  it('does not offer gpt-5-mini (rejected on ChatGPT-account auth)', () => {
    expect(LLM_MODEL_CATALOG.some((m) => m.id === 'gpt-5-mini')).toBe(false);
  });

  it('offers gpt-5-codex as a selectable OpenAI model', () => {
    const codex = LLM_MODEL_CATALOG.find((m) => m.id === 'gpt-5-codex');
    expect(codex?.enabled).toBe(true);
    expect(codex?.provider).toBe('openai');
    expect(codex?.cliModel).toBe('gpt-5-codex');
  });

  it('defaults Codex runs to gpt-5-codex', () => {
    expect(DEFAULT_CODEX_MODEL_ID).toBe('gpt-5-codex');
    expect(defaultModelIdForProvider('codex')).toBe('gpt-5-codex');
  });

  it('maps the gpt-5-codex id to its CLI model name for the codex backend', () => {
    expect(cliModelFor('gpt-5-codex', 'codex')).toBe('gpt-5-codex');
  });
});

describe('Claude default model', () => {
  it('defaults Claude runs to claude-fable-5', () => {
    expect(DEFAULT_MODEL_ID).toBe('claude-fable-5');
    expect(defaultModelIdForProvider('claude_cli')).toBe('claude-fable-5');
  });

  it('has claude-fable-5 in the catalog marked new', () => {
    const fable = LLM_MODEL_CATALOG.find((m) => m.id === 'claude-fable-5');
    expect(fable?.enabled).toBe(true);
    expect(fable?.isNew).toBe(true);
  });
});
