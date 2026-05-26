import type { Type } from '@angular/core';
import type { TurnItemKind, TurnItemRole } from '../turn-state.types';
import { FileCreateRenderer } from './file-create-renderer';
import { FileEditRenderer } from './file-edit-renderer';
import { FileReadRenderer } from './file-read-renderer';
import { GenericToolRenderer } from './generic-tool-renderer';
import { SearchRenderer } from './search-renderer';
import { ShellRenderer } from './shell-renderer';
import { ThinkingRenderer } from './thinking-renderer';

// Single source of truth for kind → renderer dispatch. Adding a new
// renderer is a one-line change here plus one file under renderers/.
// Per memory `feedback_dict_over_switch` — Record over template
// switches for string→constant lookups.
//
// Renderers that emit (chipClick) require Timeline to subscribe to
// that output via NgComponentOutlet — handled by the timeline
// container's row-emit hookup.

export const TOOL_RENDERERS: Record<TurnItemKind, Type<unknown>> = {
  thinking: ThinkingRenderer,
  'file-read': FileReadRenderer,
  'file-edit': FileEditRenderer,
  'file-create': FileCreateRenderer,
  shell: ShellRenderer,
  search: SearchRenderer,
  generic: GenericToolRenderer,
};

// Kind → display role. Drives the density filter in `<mz-timeline>`.
// Today every kind is a `detail` (work-in-progress signal). When
// `plan-step` lands it will be `'result'` — always visible. Keeping
// this as a `Record<TurnItemKind, …>` makes adding a new kind a
// compile-time enforcement, not a TODO.
export const TOOL_ROLES: Record<TurnItemKind, TurnItemRole> = {
  thinking: 'detail',
  'file-read': 'detail',
  'file-edit': 'detail',
  'file-create': 'detail',
  shell: 'detail',
  search: 'detail',
  generic: 'detail',
};

// Within `'detail'` kinds, the subset surfaced at `'normal'` density.
// Picked because each of these signals a concrete workspace impact
// (file content changed, shell command ran). The other detail kinds
// (`thinking`, `file-read`, `search`, `generic`) remain hidden until
// the user opts into `'detailed'`. Errors and `result` items bypass
// this set — they're always promoted.
export const PROMOTE_TO_NORMAL: ReadonlySet<TurnItemKind> = new Set<
  TurnItemKind
>(['file-edit', 'file-create', 'shell']);
