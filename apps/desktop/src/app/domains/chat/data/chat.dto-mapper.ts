import type { TimelineTurn } from '@mozart/ui/timeline';
import type { ChatDto, MessageDto } from './chat.dto';
import type { Chat } from './chat.model';
import type { Message, MessageRole, MessageStatus } from './message.model';

export function chatFromDto(dto: ChatDto): Chat {
  return {
    id: dto.chat_id,
    workspaceId: dto.workspace_id,
    createdAt: dto.created_at,
  };
}

const ALLOWED_ROLES: ReadonlySet<MessageRole> = new Set(['user', 'assistant']);
const ALLOWED_STATUSES: ReadonlySet<MessageStatus> = new Set([
  'pending',
  'queued',
  'streaming',
  'done',
  'error',
  'stopped',
]);

export function messageFromDto(dto: MessageDto): Message {
  return {
    id: dto.message_id,
    chatId: dto.chat_id,
    role: coerceRole(dto.role),
    content: dto.content,
    mode: dto.mode === 'plan' ? 'plan' : 'normal',
    status: coerceStatus(dto.status),
    createdAt: dto.created_at,
    timeline: parseTimeline(dto.timeline_json),
  };
}

function coerceRole(raw: string): MessageRole {
  return ALLOWED_ROLES.has(raw as MessageRole)
    ? (raw as MessageRole)
    : 'assistant';
}

function coerceStatus(raw: string): MessageStatus {
  return ALLOWED_STATUSES.has(raw as MessageStatus)
    ? (raw as MessageStatus)
    : 'done';
}

function parseTimeline(json: string | null): TimelineTurn | undefined {
  if (json == null) return undefined;
  try {
    return JSON.parse(json) as TimelineTurn;
  } catch {
    return undefined;
  }
}

export function timelineToJson(timeline: TimelineTurn | undefined): string | null {
  if (timeline == null) return null;
  try {
    return JSON.stringify(timeline);
  } catch {
    return null;
  }
}
