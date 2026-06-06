import type { SkillsPort } from '@mozart/desktop-skills-data-access';
import { commands } from './_bindings';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Backs SkillsStore with the Rust `list_skills` filesystem discovery. Passes
// stable ids (provider + projectId) — Rust resolves the repo path. The wire
// `Skill[]` is structurally assignable to `DiscoveredSkill[]`; the store owns
// the mapping to UI descriptors.
export function tauriSkillsPort(): SkillsPort {
  return {
    async list(provider, projectId) {
      return unwrap(await commands.listSkills(provider, projectId));
    },
  };
}
