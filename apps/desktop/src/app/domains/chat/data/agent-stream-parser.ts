import type {
  TimelineItem,
  TimelineItemKind,
  TimelineTurn,
} from '@mozart/ui/timeline';
import type { AgentEvent } from '../../llm-model';
import type { Message } from './message.model';

// Empty timeline used as a fallback when a message has not been
// initialized with one. The facade pre-populates every assistant
// message with a real TimelineTurn so this is just defensive.
const EMPTY_TURN: TimelineTurn = {
  summary: '',
  isStreaming: true,
  items: [],
  showDoneMarker: false,
};

function mapToolNameToKind(toolName: string): TimelineItemKind {
  const lower = toolName.toLowerCase();
  if (lower === 'view' || lower.includes('read')) return 'file-read';
  if (lower.includes('create') || lower === 'write_file') return 'file-create';
  if (lower.includes('edit') || lower.includes('replace')) return 'file-edit';
  if (
    lower.includes('bash') ||
    lower.includes('shell') ||
    lower.includes('command')
  )
    return 'shell';
  if (
    lower.includes('grep') ||
    lower.includes('glob') ||
    lower.includes('search')
  )
    return 'search';
  return 'generic';
}

function demoteActiveItems(items: readonly TimelineItem[]): TimelineItem[] {
  return items.map((item) =>
    item.state === 'active' ? { ...item, state: 'done' as const } : item,
  );
}

// Pure reducer : take a Message + the next AgentEvent → return the
// updated Message. No DOM, no Angular, no IO.
export function applyAgentEvent(message: Message, event: AgentEvent): Message {
  const turn = message.timeline ?? EMPTY_TURN;

  switch (event.kind) {
    case 'text':
      return { ...message, content: message.content + event.delta };

    case 'thinking': {
      const existingIdx = turn.items.findIndex((i) => i.id === event.id);
      if (existingIdx >= 0) {
        const next = [...turn.items];
        const item = next[existingIdx];
        if (!item) return message;
        next[existingIdx] = {
          ...item,
          body: (item.body ?? '') + event.delta,
        };
        return { ...message, timeline: { ...turn, items: next } };
      }
      const items = demoteActiveItems(turn.items);
      items.push({
        id: event.id,
        kind: 'thinking',
        state: 'active',
        title: 'Thinking',
        body: event.delta,
      });
      return { ...message, timeline: { ...turn, items } };
    }

    case 'tool_call': {
      const items = demoteActiveItems(turn.items);
      items.push({
        id: event.id,
        kind: mapToolNameToKind(event.toolName),
        state: 'active',
        title: event.title ?? event.toolName,
        fileChip: event.fileChip,
      });
      return { ...message, timeline: { ...turn, items } };
    }

    case 'tool_result': {
      const items = turn.items.map((item) =>
        item.id === event.id
          ? {
              ...item,
              state: event.ok ? ('done' as const) : ('error' as const),
              body: event.summary ?? item.body,
            }
          : item,
      );
      return { ...message, timeline: { ...turn, items } };
    }

    case 'status':
      return { ...message, timeline: { ...turn, summary: event.text } };

    case 'error': {
      const items: TimelineItem[] = [
        ...demoteActiveItems(turn.items),
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
        ...message,
        status: 'error',
        timeline: {
          ...turn,
          items,
          isStreaming: false,
          outcome: 'error',
          elapsedMs: Date.now() - message.createdAt,
        },
      };
    }

    case 'done': {
      const items = demoteActiveItems(turn.items);
      return {
        ...message,
        status: 'done',
        timeline: {
          ...turn,
          items,
          isStreaming: false,
          showDoneMarker: true,
          outcome: 'done',
          elapsedMs: Date.now() - message.createdAt,
        },
      };
    }

    case 'stopped': {
      const items = demoteActiveItems(turn.items);
      return {
        ...message,
        status: 'stopped',
        timeline: {
          ...turn,
          items,
          isStreaming: false,
          outcome: 'stopped',
          elapsedMs: Date.now() - message.createdAt,
        },
      };
    }
  }
}
