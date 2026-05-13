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

export interface TimelineTurn {
  readonly summary: string;
  readonly isStreaming: boolean;
  readonly items: readonly TimelineItem[];
  readonly showDoneMarker: boolean;
}

export interface TimelineFileChipClick {
  readonly itemId: string;
  readonly label: string;
}

export interface TimelineItemExpandedChange {
  readonly itemId: string;
  readonly expanded: boolean;
}
