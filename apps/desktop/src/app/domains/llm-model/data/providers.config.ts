// App-code catalog of LLM providers + models. Lives in TS, not in the
// local DB: the DB is user-writable, and we don't want a tampered row
// to surface an "available" model that the backend can't actually run.
//
// Phase 2 (per Q3 resolution): Anthropic models are enabled; OpenAI /
// Local rows render in the select but are visually disabled with a
// "Coming soon" badge until the backend can route to them.

export type ProviderId = 'anthropic' | 'openai' | 'local';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  /** Full ng-icons identifier (e.g. `lucideSparkles`) used both in the
   * trigger and in the group header. */
  readonly iconName: string;
}

export interface ModelOption {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  /** `false` → row visible but not selectable (rendered with "Coming soon"). */
  readonly enabled: boolean;
  readonly isNew?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: { id: 'anthropic', label: 'Anthropic', iconName: 'lucideSparkles' },
  openai: { id: 'openai', label: 'OpenAI', iconName: 'lucideCpu' },
  local: { id: 'local', label: 'Local', iconName: 'lucideHardDrive' },
};

export const LLM_MODEL_CATALOG: readonly ModelOption[] = [
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    enabled: true,
    isNew: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    enabled: true,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    enabled: true,
  },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai', enabled: false },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 mini',
    provider: 'openai',
    enabled: false,
  },
  {
    id: 'local-default',
    name: 'Local model',
    provider: 'local',
    enabled: false,
  },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';

/** Lookup a model option by id; falls back to the default model row. */
export function resolveModel(modelId: string | null | undefined): ModelOption {
  if (modelId) {
    const match = LLM_MODEL_CATALOG.find((m) => m.id === modelId);
    if (match) return match;
  }
  return (
    LLM_MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_ID) ??
    LLM_MODEL_CATALOG[0]
  );
}
