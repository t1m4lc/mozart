// Raw shape returned by Tauri. Re-exported under a domain-local name so
// no other file in this domain reaches into `core/_bindings`. `icon`
// and `hidden` are client-only fields in v0.0.1 — a later migration
// adds them to the `repos` table, at which point the DTO grows two
// more columns and the adapter starts reading them.

export type { Repo as ProjectDto } from '../../../core/_bindings';
