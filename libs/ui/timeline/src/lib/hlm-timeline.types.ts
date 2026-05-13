export type TimelineItemState = 'pending' | 'active' | 'done' | 'error';

export type TimelineItemKind =
  | 'thinking'
  | 'file-read'
  | 'file-edit'
  | 'file-create'
  | 'shell'
  | 'search'
  | 'generic';

export interface TimelineFileChip {
  readonly label: string;
  readonly added?: number;
  readonly removed?: number;
}

export interface TimelineItem {
  readonly id: string;
  readonly kind: TimelineItemKind;
  readonly state: TimelineItemState;
  readonly title: string;
  readonly fileChip?: TimelineFileChip;
  readonly body?: string;
  readonly defaultExpanded?: boolean;
}

export type TimelineOutcome = 'done' | 'stopped' | 'error';

export interface TimelineTurn {
  readonly summary: string;
  readonly isStreaming: boolean;
  readonly items: readonly TimelineItem[];
  readonly showDoneMarker: boolean;
  // Set when `isStreaming` flips to false. Drives the header swap
  // from CLI spinner + status text → check/X + elapsed time.
  readonly outcome?: TimelineOutcome;
  readonly elapsedMs?: number;
}

export interface TimelineFileChipClick {
  readonly itemId: string;
  readonly label: string;
}

export interface TimelineItemExpandedChange {
  readonly itemId: string;
  readonly expanded: boolean;
}
