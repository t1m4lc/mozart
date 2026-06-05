// Provider-aware skill catalog model. Two orthogonal axes drive the
// composer slash menu:
//   - `runtimes` (compatibility) decides WHICH skills show for the
//     selected model's backend — the filter axis.
//   - `source` (provenance) decides WHICH group header a skill sits
//     under — the grouping axis, and the future marketplace facet.
// Kept separate so marketplace skills (gstack, Superhuman, role skills)
// that run on any backend don't get crammed into a "provider" field.

import type { AgentProviderId } from '@mozart/desktop-llm-model-util';

/** Agent backend a skill can run on. Extend the union to add a provider. */
export type SkillRuntime = 'claude' | 'codex';

/** Where a skill came from. Drives grouping + the future marketplace. */
export type SkillSourceKind = 'mozart' | 'builtin' | 'marketplace' | 'user';

/** Closeness scope. `project` wins over `global` on id conflict (future). */
export type SkillScope = 'global' | 'project';

export interface SkillSource {
  readonly kind: SkillSourceKind;
  /** Marketplace/builtin publisher, e.g. `gstack`, `superhuman`, `claude`. */
  readonly publisher?: string;
}

export interface SkillDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Filter axis. `'any'` = agent-agnostic (most Mozart-native + marketplace). */
  readonly runtimes: 'any' | readonly SkillRuntime[];
  /** Group axis. */
  readonly source: SkillSource;
  readonly scope: SkillScope;
  /** `false` → row visible but not selectable (rendered with "Coming soon"). */
  readonly availability: 'available' | 'coming_soon';
  /** Future marketplace facet (e.g. `ops`, `sales`, `admin`). */
  readonly category?: string;
}

/** How the menu narrows skills to the selected model's backend. */
export type SkillFilterMode = 'current' | 'agnostic-plus-current' | 'all';

/** Default: agent-agnostic skills + the current backend's skills. */
export const DEFAULT_SKILL_FILTER_MODE: SkillFilterMode = 'agnostic-plus-current';

/** Display metadata for a group header, keyed by `SkillSourceKind`. */
export interface SkillSourceInfo {
  readonly kind: SkillSourceKind;
  readonly label: string;
  /** Full ng-icons identifier (e.g. `lucideSparkles`). */
  readonly iconName: string;
  /** Lower sorts first. Mozart-native leads. */
  readonly order: number;
}

export const SKILL_SOURCE_REGISTRY: Record<SkillSourceKind, SkillSourceInfo> = {
  mozart: { kind: 'mozart', label: 'Mozart', iconName: 'lucideSparkles', order: 0 },
  builtin: { kind: 'builtin', label: 'Provider', iconName: 'lucideCpu', order: 1 },
  marketplace: {
    kind: 'marketplace',
    label: 'Marketplace',
    iconName: 'lucideStore',
    order: 2,
  },
  user: { kind: 'user', label: 'Your skills', iconName: 'lucideUser', order: 3 },
};

/** Map the active agent backend to a skill runtime. The catalog is
 *  user-facing so it speaks `claude`/`codex`, not the CLI wire-ids. */
export function runtimeForAgentProvider(agent: AgentProviderId): SkillRuntime {
  return agent === 'codex' ? 'codex' : 'claude';
}
