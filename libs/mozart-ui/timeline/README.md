# timeline

Renders the agent's reply in the chat panel.

## Phase 3a — current state

Public surface is the minimal `MessageBody` component that renders
the agent's streamed prose as a clean paragraph with a pulsing
cursor while streaming. The Claude-style turn header, vertical
timeline items, file chips, diff stats, and done/error markers
that previously lived here were removed because the visuals were
broken; they will be reintroduced in Phase 3b against reference
snippets captured from Claude.ai.

```ts
import { MessageBody } from '@mozart-ui/timeline';
```

The reducer + types that drive the turn state (`TurnState`,
`AgentEvent`, `applyAgentEvent`) live in
`apps/desktop/src/app/domains/llm-model/data/stream/` as pure
functions. The UI imports `TurnState` as a type-only dependency
when Phase 3b lands.

## Phase 3b — coming

Specs : `docs/engineering/specs/llm-stream-parser.md` §4-§7, and
`docs/engineering/specs/composer-timeline-ui.md` §4.
