// Pure DOMAIN selectors for the skill catalog. Provider-aware filtering
// (which skills run on the selected model's backend) and source grouping
// (which header a skill sits under) live here. The composer owns the
// query-filter / keyboard-nav / token logic — that's UI-generic and can't
// reach this app-scoped lib anyway. Keeping the default filter mode behind
// one argument means a future Settings preference is a one-line change.

import {
  DEFAULT_SKILL_FILTER_MODE,
  SKILL_SOURCE_REGISTRY,
  type SkillDescriptor,
  type SkillFilterMode,
  type SkillRuntime,
  type SkillSourceKind,
} from './skill.model';

/** True if `skill` can run on `runtime` (agent-agnostic skills run on all). */
export function runsOn(skill: SkillDescriptor, runtime: SkillRuntime): boolean {
  return skill.runtimes === 'any' || skill.runtimes.includes(runtime);
}

/** True if `skill` is tagged to a specific runtime (i.e. not agnostic). */
function isProviderSpecific(skill: SkillDescriptor): boolean {
  return skill.runtimes !== 'any';
}

/**
 * The skills to show for the active backend, per filter mode:
 *   - `current`                → provider-specific skills for this runtime only
 *   - `agnostic-plus-current`  → the above + agent-agnostic skills (default)
 *   - `all`                    → everything, regardless of runtime
 * `coming_soon` skills are kept (rendered disabled) — selectability is the
 * caller's concern, not visibility.
 */
export function visibleSkills(
  catalog: readonly SkillDescriptor[],
  opts: { activeRuntime: SkillRuntime; filterMode?: SkillFilterMode },
): readonly SkillDescriptor[] {
  const mode = opts.filterMode ?? DEFAULT_SKILL_FILTER_MODE;
  if (mode === 'all') return catalog;
  if (mode === 'current') {
    return catalog.filter(
      (s) => isProviderSpecific(s) && runsOn(s, opts.activeRuntime),
    );
  }
  return catalog.filter((s) => runsOn(s, opts.activeRuntime));
}

export interface SkillGroup {
  /** Stable group key: publisher when present, else the source kind. */
  readonly key: string;
  readonly label: string;
  readonly iconName: string;
  readonly kind: SkillSourceKind;
  readonly skills: readonly SkillDescriptor[];
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Group skills for the menu by source — Mozart-native first, then provider
 * builtins, then marketplace, then user. Builtin/marketplace skills split
 * into one group per publisher so "Claude" / "Codex" / "Gstack" each get
 * their own header. Within a group, catalog order is preserved.
 */
export function groupSkills(
  skills: readonly SkillDescriptor[],
): readonly SkillGroup[] {
  const byKey = new Map<string, SkillDescriptor[]>();
  for (const s of skills) {
    const key = s.source.publisher ?? s.source.kind;
    const bucket = byKey.get(key) ?? [];
    bucket.push(s);
    byKey.set(key, bucket);
  }
  const groups: SkillGroup[] = [...byKey.entries()].map(([key, items]) => {
    const kind = items[0].source.kind;
    const publisher = items[0].source.publisher;
    return {
      key,
      label: publisher
        ? capitalize(publisher)
        : SKILL_SOURCE_REGISTRY[kind].label,
      iconName: SKILL_SOURCE_REGISTRY[kind].iconName,
      kind,
      skills: items,
    };
  });
  return groups.sort((a, b) => {
    const order =
      SKILL_SOURCE_REGISTRY[a.kind].order - SKILL_SOURCE_REGISTRY[b.kind].order;
    return order !== 0 ? order : a.label.localeCompare(b.label);
  });
}
