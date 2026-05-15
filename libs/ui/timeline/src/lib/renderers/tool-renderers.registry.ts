import type { Type } from '@angular/core';
import type { TurnItemKind } from '../turn-state.types';
import { GenericToolRenderer } from './generic-tool-renderer';
import { SearchRenderer } from './search-renderer';
import { ShellRenderer } from './shell-renderer';
import { ThinkingRenderer } from './thinking-renderer';

// Single source of truth for kind → renderer dispatch. Adding a new
// renderer is a one-line change here plus one file under renderers/.
// Per memory `feedback_dict_over_switch` — Record over template
// switches for string→constant lookups.
//
// File renderers (file-read/-edit/-create) land in atom 4 with the
// file-chip + diff-stats pieces. Until then they fall back to the
// generic wrench renderer.

export const TOOL_RENDERERS: Record<TurnItemKind, Type<unknown>> = {
  thinking: ThinkingRenderer,
  'file-read': GenericToolRenderer,
  'file-edit': GenericToolRenderer,
  'file-create': GenericToolRenderer,
  shell: ShellRenderer,
  search: SearchRenderer,
  generic: GenericToolRenderer,
};
