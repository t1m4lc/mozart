import type { Type } from '@angular/core';
import type { TurnItemKind } from '../turn-state.types';
import { GenericToolRenderer } from './generic-tool-renderer';

// Single source of truth for kind → renderer dispatch. Adding a new
// renderer is a one-line change here plus one file under renderers/.
// Per memory `feedback_dict_over_switch` — Record over template
// switches for string→constant lookups.
//
// Atom 2 wires only `generic`; later atoms register thinking,
// file-read/-edit/-create, shell, search renderers and have the same
// `item: TurnItem` + `showSpacer` + `showConnector` input contract,
// so swapping in a specific renderer is safe.

export const TOOL_RENDERERS: Record<TurnItemKind, Type<unknown>> = {
  thinking: GenericToolRenderer,
  'file-read': GenericToolRenderer,
  'file-edit': GenericToolRenderer,
  'file-create': GenericToolRenderer,
  shell: GenericToolRenderer,
  search: GenericToolRenderer,
  generic: GenericToolRenderer,
};
