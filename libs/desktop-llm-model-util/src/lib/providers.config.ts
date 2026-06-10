// App-code catalog of LLM providers + models. Lives in TS, not in the
// local DB: the DB is user-writable, and we don't want a tampered row to
// surface an "available" model that the backend can't actually run.
//
// PROVIDER_REGISTRY is the single source of truth for the provider list —
// onboarding cards, Settings connection cards, and composer model grouping
// all derive from it. Adding Local / Mozart Cloud later = one descriptor
// (+ a ProfileFacade connection track when it becomes connectable).

export type ProviderId = 'anthropic' | 'openai' | 'local';

// The agent backend a run targets. Mirrors the Rust `AgentProvider::from_id`
// wire ids — keep these strings in sync with that enum.
export type AgentProviderId = 'claude_cli' | 'codex';

/** Registry ids — the catalog `ProviderId`s plus future-only providers that
 *  have no models yet. */
export type RegistryProviderId = ProviderId | 'mozart_cloud';

/** The profile-domain connection track a provider authenticates through.
 *  `undefined` for `coming_soon` providers that aren't connectable yet. */
export type ConnectionProviderId = 'claude' | 'codex';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  /** Full ng-icons identifier (e.g. `lucideSparkles`). */
  readonly iconName: string;
}

export interface ModelOption {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  /** `false` → row visible but not selectable (rendered with "Coming soon"). */
  readonly enabled: boolean;
  readonly isNew?: boolean;
  /** The model name/alias passed to the provider CLI (`claude --model`,
   *  `codex -m`). Stable aliases for Claude (`opus`/`sonnet`/`haiku`); the
   *  bare id for Codex. Absent ⇒ let the CLI use its configured default. */
  readonly cliModel?: string;
  /** Max context window in tokens. Drives the composer context gauge
   *  (input tokens ÷ contextWindow). Absent ⇒ unknown, gauge hidden. */
  readonly contextWindow?: number;
}

export interface ProviderDescriptor {
  readonly id: RegistryProviderId;
  readonly label: string;
  readonly iconName: string;
  /** Which agent backend runs this provider, when connectable. */
  readonly agentProvider?: AgentProviderId;
  /** Profile connection track used to read status / drive connect actions. */
  readonly connectionProvider?: ConnectionProviderId;
  readonly availability: 'available' | 'coming_soon';
  /** Auth flows the setup UI should offer for this provider. */
  readonly authKinds: readonly ('cli_login' | 'api_key')[];
}

// ── Source of truth ──────────────────────────────────────────────────────

export const PROVIDER_REGISTRY: readonly ProviderDescriptor[] = [
  {
    id: 'anthropic',
    label: 'Claude Code',
    iconName: 'lucideSparkles',
    agentProvider: 'claude_cli',
    connectionProvider: 'claude',
    availability: 'available',
    authKinds: ['cli_login', 'api_key'],
  },
  {
    id: 'openai',
    label: 'Codex (OpenAI)',
    iconName: 'lucideCpu',
    agentProvider: 'codex',
    connectionProvider: 'codex',
    availability: 'available',
    authKinds: ['cli_login', 'api_key'],
  },
  {
    id: 'local',
    label: 'Local models',
    iconName: 'lucideHardDrive',
    availability: 'coming_soon',
    authKinds: [],
  },
  // {
  //   id: 'mozart_cloud',
  //   label: 'Mozart Cloud',
  //   iconName: 'lucideCloud',
  //   availability: 'coming_soon',
  //   authKinds: [],
  // },
];

const CATALOG_PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'openai',
  'local',
];

function isCatalogProvider(id: RegistryProviderId): id is ProviderId {
  return (CATALOG_PROVIDER_IDS as readonly string[]).includes(id);
}

/** Provider display info keyed by catalog `ProviderId`, derived from
 *  PROVIDER_REGISTRY so labels/icons have a single source. Used by the
 *  composer model-select for group headers. */
export const PROVIDERS: Record<ProviderId, ProviderInfo> = Object.fromEntries(
  PROVIDER_REGISTRY.filter((d) => isCatalogProvider(d.id)).map((d) => [
    d.id,
    { id: d.id as ProviderId, label: d.label, iconName: d.iconName },
  ]),
) as Record<ProviderId, ProviderInfo>;

export const LLM_MODEL_CATALOG: readonly ModelOption[] = [
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    provider: 'anthropic',
    enabled: true,
    isNew: true,
    // Full model id (not a short alias) — the CLI passes it straight to
    // the API, so it works without depending on an unverified `fable`
    // alias being registered in the Claude CLI.
    cliModel: 'claude-fable-5',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    enabled: true,
    cliModel: 'opus',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    enabled: true,
    cliModel: 'opus',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    enabled: true,
    cliModel: 'sonnet',
    contextWindow: 1_000_000,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    enabled: true,
    cliModel: 'haiku',
    contextWindow: 200_000,
  },
  {
    // Codex-tuned GPT-5. The default for Codex runs — `gpt-5-mini` is
    // rejected on ChatGPT-account auth, so it's not in the catalog.
    // 400K total context (272K input cap + 128K output).
    id: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    provider: 'openai',
    enabled: true,
    isNew: true,
    cliModel: 'gpt-5-codex',
    contextWindow: 400_000,
  },
  {
    // GPT-5 context window is 400K total (272K input cap + 128K output).
    id: 'gpt-5',
    name: 'GPT-5 (Codex)',
    provider: 'openai',
    enabled: true,
    cliModel: 'gpt-5',
    contextWindow: 400_000,
  },
  {
    id: 'local-default',
    name: 'Local model',
    provider: 'local',
    enabled: false,
  },
];

export const DEFAULT_MODEL_ID = 'claude-fable-5';

/** Default model for Codex runs. `gpt-5-codex` is the only Codex model
 *  that works on a ChatGPT-account login (`gpt-5-mini` is rejected). */
export const DEFAULT_CODEX_MODEL_ID = 'gpt-5-codex';

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

/** Map a catalog `ProviderId` to the agent backend that runs it. OpenAI
 *  models run through the Codex CLI; everything else (Anthropic, and the
 *  not-yet-supported Local row) goes through the Claude CLI path. */
export function agentProviderForModel(provider: ProviderId): AgentProviderId {
  return provider === 'openai' ? 'codex' : 'claude_cli';
}

/** The model id to show when a chat has no explicit pick, given the active
 *  agent backend. Keeps a Codex-only tester from seeing a Claude model
 *  selected by default. Falls back to {@link DEFAULT_MODEL_ID}. */
export function defaultModelIdForProvider(agent: AgentProviderId): string {
  if (agent === 'codex') {
    const preferred = LLM_MODEL_CATALOG.find(
      (m) => m.id === DEFAULT_CODEX_MODEL_ID && m.enabled,
    );
    if (preferred) return preferred.id;
    // Fallback: first enabled OpenAI model, should the preferred id ever
    // be removed from the catalog.
    const codexModel = LLM_MODEL_CATALOG.find(
      (m) => m.provider === 'openai' && m.enabled,
    );
    if (codexModel) return codexModel.id;
  }
  return DEFAULT_MODEL_ID;
}

/** The CLI model name to pass for `modelId`, but only when the model belongs
 *  to the backend actually running the turn (`agent`). A mismatch (e.g. a
 *  Claude model picked while only Codex is connected) returns `null` so the
 *  CLI uses its own default rather than erroring on an unknown model. */
export function cliModelFor(
  modelId: string | null | undefined,
  agent: AgentProviderId,
): string | null {
  if (!modelId) return null;
  const model = LLM_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model || !model.cliModel) return null;
  return agentProviderForModel(model.provider) === agent
    ? model.cliModel
    : null;
}

/** The catalog models that are togglable in the Settings composer-models
 *  picker — i.e. the runnable ones (catalog `enabled`). "Coming soon" rows
 *  are excluded since the user can't run them. */
export function selectableComposerModels(): readonly ModelOption[] {
  return LLM_MODEL_CATALOG.filter((m) => m.enabled);
}

/** The models the composer should show, given the user's enabled-ids
 *  preference. Empty/unset ⇒ all runnable models (never an empty dropdown). */
export function composerModels(
  enabledIds: readonly string[] | null | undefined,
): readonly ModelOption[] {
  const runnable = selectableComposerModels();
  if (!enabledIds || enabledIds.length === 0) return runnable;
  const allow = new Set(enabledIds);
  const filtered = runnable.filter((m) => allow.has(m.id));
  // Guard: a stale preference that filters everything out falls back to all
  // runnable models rather than showing an empty composer.
  return filtered.length > 0 ? filtered : runnable;
}
