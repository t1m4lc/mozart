import type { TurnState } from '../../llm-model';
import type { ChatDto, MessageDto } from './chat.dto';
import type { Chat, ChatMode, EffortLevel } from './chat.model';
import type {
  Message,
  MessageRole,
  MessageStatus,
  SystemInfo,
} from './message.model';

const ALLOWED_MODES: ReadonlySet<ChatMode> = new Set(['agent', 'plan', 'ask']);
const ALLOWED_EFFORTS: ReadonlySet<EffortLevel> = new Set([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export function chatFromDto(dto: ChatDto): Chat {
  return {
    id: dto.chat_id,
    workspaceId: dto.workspace_id,
    title: dto.title,
    modelId: dto.llm_id,
    mode: coerceMode(dto.mode),
    effort: coerceEffort(dto.effort),
    lastReadMessageId: dto.last_read_message_id,
    createdAt: dto.created_at,
  };
}

const ALLOWED_ROLES: ReadonlySet<MessageRole> = new Set([
  'user',
  'assistant',
  'system',
]);
const ALLOWED_STATUSES: ReadonlySet<MessageStatus> = new Set([
  'pending',
  'queued',
  'streaming',
  'done',
  'error',
  'stopped',
]);

export function messageFromDto(dto: MessageDto): Message {
  const role = coerceRole(dto.role);
  // `timeline_json` is shared between assistant TurnState and the system_info
  // payload — discriminated by `role`. Keeps the DB schema unchanged.
  const turnState = role === 'assistant' ? parseTurnState(dto.timeline_json) : undefined;
  const systemInfo = role === 'system' ? parseSystemInfo(dto.timeline_json) : undefined;
  return {
    id: dto.message_id,
    chatId: dto.chat_id,
    role,
    content: dto.content,
    mode: coerceMessageMode(dto.mode),
    status: coerceStatus(dto.status),
    createdAt: dto.created_at,
    turnState,
    systemInfo,
  };
}

function coerceMode(raw: string): ChatMode {
  return ALLOWED_MODES.has(raw as ChatMode) ? (raw as ChatMode) : 'agent';
}

function coerceEffort(raw: string): EffortLevel {
  return ALLOWED_EFFORTS.has(raw as EffortLevel)
    ? (raw as EffortLevel)
    : 'medium';
}

function coerceMessageMode(raw: string | null): ChatMode | undefined {
  if (raw == null) return undefined;
  return ALLOWED_MODES.has(raw as ChatMode) ? (raw as ChatMode) : undefined;
}

function coerceRole(raw: string): MessageRole {
  return ALLOWED_ROLES.has(raw as MessageRole)
    ? (raw as MessageRole)
    : 'assistant';
}

function parseSystemInfo(json: string | null): SystemInfo | undefined {
  if (json == null) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { kind?: unknown }).kind !== 'system_info'
    ) {
      return undefined;
    }
    const obj = parsed as { kind: 'system_info'; title?: unknown; bullets?: unknown };
    const title = typeof obj.title === 'string' ? obj.title : '';
    const bullets = Array.isArray(obj.bullets)
      ? obj.bullets.filter((b): b is string => typeof b === 'string')
      : [];
    return { kind: 'system_info', title, bullets };
  } catch {
    return undefined;
  }
}

export function systemInfoToJson(info: SystemInfo): string {
  return JSON.stringify(info);
}

function coerceStatus(raw: string): MessageStatus {
  return ALLOWED_STATUSES.has(raw as MessageStatus)
    ? (raw as MessageStatus)
    : 'done';
}

function parseTurnState(json: string | null): TurnState | undefined {
  if (json == null) return undefined;
  try {
    return JSON.parse(json) as TurnState;
  } catch {
    return undefined;
  }
}

export function turnStateToJson(turnState: TurnState | undefined): string | null {
  if (turnState == null) return null;
  try {
    return JSON.stringify(turnState);
  } catch {
    return null;
  }
}
