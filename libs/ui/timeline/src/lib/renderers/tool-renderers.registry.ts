import type { Type } from '@angular/core';
import type { TurnItemKind } from '../turn-state.types';
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
