// Pure reducer: (state, event) → state. No DOM, no Angular, no IO.
// The optional `now` parameter is the only impurity — defaults to
// Date.now, tests inject a fake clock.

import type {
  AgentEvent,
  TurnItem,
  TurnItemKind,
  TurnState,
  TurnUsage,
} from './event.types';

const TOOL_KIND_RULES: ReadonlyArray<
  readonly [(name: string) => boolean, TurnItemKind]
> = [
  [(n) => n === 'view' || n.includes('read'), 'file-read'],
  [(n) => n.includes('create') || n === 'write_file', 'file-create'],
  [(n) => n.includes('edit') || n.includes('replace'), 'file-edit'],
  [(n) => n.includes('bash') || n.includes('shell') || n.includes('command'), 'shell'],
  [(n) => n.includes('grep') || n.includes('glob') || n.includes('search'), 'search'],
];

// User-facing summary phrases the header shimmers through while the
// agent works. Claude CLI doesn't emit explicit `status_delta` events,
// so the reducer derives the summary from the latest tool/thinking
// activity. Spec §5.1 priority: explicit status_delta > tool title >
// generic fallback.
const SUMMARY_BY_KIND: Record<TurnItemKind, string> = {
  thinking: 'Thinking…',
  'file-read': 'Reading files…',
  'file-edit': 'Editing files…',
  'file-create': 'Creating files…',
  shell: 'Running command…',
  search: 'Searching…',
  generic: 'Using tool…',
};

export function EMPTY_TURN_STATE(startedAt: number): TurnState {
  return {
    text: '',
    summary: '',
    isStreaming: true,
    items: [],
    showDoneMarker: false,
    startedAt,
  };
}

export function applyAgentEvent(
  state: TurnState,
  event: AgentEvent,
  now: () => number = Date.now,
): TurnState {
  switch (event.kind) {
    case 'text':
      return { ...state, text: state.text + event.delta };

    case 'thinking': {
      const existingIdx = state.items.findIndex((i) => i.id === event.id);
      if (existingIdx >= 0) {
        const next = [...state.items];
        const item = next[existingIdx];
        if (!item) return state;
        next[existingIdx] = { ...item, body: (item.body ?? '') + event.delta };
        return { ...state, items: next };
      }
      const items = demoteActiveItems(state.items);
      items.push({
        id: event.id,
        kind: 'thinking',
        state: 'active',
        title: 'Thinking',
        body: event.delta,
      });
      return { ...state, items, summary: SUMMARY_BY_KIND.thinking };
    }

    case 'tool_call': {
      const items = demoteActiveItems(state.items);
      const kind = mapToolNameToKind(event.toolName);
      items.push({
        id: event.id,
        kind,
        state: 'active',
        title: event.title ?? event.toolName,
        fileChip: event.fileChip,
      });
      return { ...state, items, summary: SUMMARY_BY_KIND[kind] };
    }

    case 'tool_result': {
      const items = state.items.map((item) =>
        item.id === event.id
          ? {
              ...item,
              state: event.ok ? ('done' as const) : ('error' as const),
              body: event.summary ?? item.body,
            }
          : item,
      );
      return { ...state, items };
    }

    case 'status':
      return { ...state, summary: event.text };

    case 'usage':
      return { ...state, usage: mergeUsage(state.usage, event.usage) };

    case 'error': {
      const items: TurnItem[] = [
        ...demoteActiveItems(state.items),
        {
          id: crypto.randomUUID(),
          kind: 'generic',
          state: 'error',
          title: 'Error',
          body: event.message,
          defaultExpanded: true,
        },
      ];
      return {
        ...state,
        items,
        summary: 'Error',
        isStreaming: false,
        outcome: 'error',
        elapsedMs: now() - state.startedAt,
      };
    }

    case 'done': {
      const items = demoteActiveItems(state.items);
      return {
        ...state,
        items,
        summary: 'Completed',
        isStreaming: false,
        showDoneMarker: true,
        outcome: 'done',
        elapsedMs: now() - state.startedAt,
      };
    }

    case 'stopped': {
      const items = demoteActiveItems(state.items);
      return {
        ...state,
        items,
        summary: 'Stopped',
        isStreaming: false,
        outcome: 'stopped',
        elapsedMs: now() - state.startedAt,
      };
    }
  }
}

// Latest-known wins per field — providers report different subsets at
// different points in the stream, so an emission that omits a field must
// not clobber a value an earlier emission already set.
function mergeUsage(prev: TurnUsage | undefined, next: TurnUsage): TurnUsage {
  return {
    inputTokens: next.inputTokens ?? prev?.inputTokens,
    outputTokens: next.outputTokens ?? prev?.outputTokens,
    cacheReadTokens: next.cacheReadTokens ?? prev?.cacheReadTokens,
    cacheCreationTokens: next.cacheCreationTokens ?? prev?.cacheCreationTokens,
  };
}

function demoteActiveItems(items: readonly TurnItem[]): TurnItem[] {
  return items.map((item) =>
    item.state === 'active' ? { ...item, state: 'done' as const } : item,
  );
}

function mapToolNameToKind(toolName: string): TurnItemKind {
  const lower = toolName.toLowerCase();
  for (const [match, kind] of TOOL_KIND_RULES) {
    if (match(lower)) return kind;
  }
  return 'generic';
}
