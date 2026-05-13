# timeline

Mozart agent-activity timeline. Dumb, presentation-only component
rendering a streaming turn header + a vertical list of typed items
(thinking / file-read / file-edit / file-create / shell / search /
generic) with shimmer/active/done/error states and an optional Done
marker.

Public surface :

```ts
import {
  HlmTimeline,
  HlmTimelineImports,
  type TimelineTurn,
  type TimelineItem,
  type TimelineItemKind,
  type TimelineItemState,
  type TimelineFileChip,
} from '@mozart/ui/timeline';
```

Spec : `docs/specs/llm-stream-parser-specs.md`.
