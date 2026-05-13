// Raw shape returned by Tauri. Re-exported under a domain-local name so
// no other file in this domain reaches into `core/_bindings`. `icon`,
// `hidden`, `sort_index` are persisted as of migration 002.

export type { Repo as ProjectDto } from '../../../core/_bindings';
