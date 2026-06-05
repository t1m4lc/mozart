// Reconciles a filesystem-discovered skill (the Rust `list_skills` wire shape)
// into the UI `SkillDescriptor` the selectors + slash menu consume. This is the
// ONE bridge between the two skill models, so the rest of the app stays blind to
// the wire taxonomy.
//
// The wire type is mirrored locally (not imported from the Tauri bindings):
// `desktop-skills-util` is a pure `util` lib and may not depend on the
// `desktop-core-tauri` adapter. A binding `Skill` is structurally assignable to
// `DiscoveredSkill`, so the data-access layer maps the list with no glue.
//
//   wire source            UI source.kind   group header (via publisher)
//   ─────────────────────  ───────────────  ────────────────────────────
//   mozart-project         mozart           "Mozart"
//   claude-provider        builtin          publisher ?? "Claude"
//   codex-provider         builtin          publisher ?? "Codex"
//
// Note (taxonomy collapse): the wire model can't tell a provider's own skill
// from a marketplace skill that merely lives under a provider dir (e.g. gstack
// under ~/.claude/skills). Both map to `builtin`; the publisher folder still
// drives a correct group header. Marketplace provenance is a post-v1 facet.

import type {
  SkillDescriptor,
  SkillRuntime,
  SkillSource,
} from './skill.model';

/** Wire enums as emitted by the Rust `list_skills` command (kebab/lowercase). */
export type DiscoveredSkillSource =
  | 'mozart-project'
  | 'claude-provider'
  | 'codex-provider';
export type DiscoveredSkillRuntime = 'any' | 'claude' | 'codex';
export type DiscoveredSkillScope = 'project' | 'global';

/** The subset of the Tauri `Skill` binding the mapper needs. A binding `Skill`
 *  (which also carries `model_hint`) is assignable to this. */
export interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: DiscoveredSkillSource;
  readonly runtime: DiscoveredSkillRuntime;
  readonly publisher: string | null;
  readonly scope: DiscoveredSkillScope;
}

function unreachable(value: never): never {
  throw new Error(`unhandled skill enum variant: ${String(value)}`);
}

/** Wire `runtime` → descriptor `runtimes` (filter axis). */
function toRuntimes(runtime: DiscoveredSkillRuntime): SkillDescriptor['runtimes'] {
  switch (runtime) {
    case 'any':
      return 'any';
    case 'claude':
    case 'codex':
      return [runtime satisfies SkillRuntime];
    default:
      return unreachable(runtime);
  }
}

/** Wire `source` (+ publisher) → descriptor `source` (group axis). */
function toSource(
  source: DiscoveredSkillSource,
  publisher: string | null,
): SkillSource {
  switch (source) {
    case 'mozart-project':
      return { kind: 'mozart' };
    case 'claude-provider':
      return { kind: 'builtin', publisher: publisher ?? 'claude' };
    case 'codex-provider':
      return { kind: 'builtin', publisher: publisher ?? 'codex' };
    default:
      return unreachable(source);
  }
}

/**
 * Map one discovered skill to its UI descriptor. Total over the wire enums: a
 * new Rust variant fails the build here rather than silently dropping the skill.
 * Discovered skills are always `available` (they exist on disk); `coming_soon`
 * was a static-catalog concept. `category` is unset until the marketplace.
 */
export function skillToDescriptor(skill: DiscoveredSkill): SkillDescriptor {
  return {
    id: skill.id,
    label: skill.name,
    description: skill.description,
    runtimes: toRuntimes(skill.runtime),
    source: toSource(skill.source, skill.publisher),
    scope: skill.scope,
    availability: 'available',
  };
}
