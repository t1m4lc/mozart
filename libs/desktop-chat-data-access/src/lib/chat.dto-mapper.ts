import type { TurnState } from '@mozart/desktop-llm-model-util';
import type {
  Chat,
  ChatMode,
  EffortLevel,
  Message,
  MessageRole,
  MessageStatus,
  SetupProgress,
  SetupProgressStatus,
  SystemInfo,
} from '@mozart/desktop-chat-util';

// Wire shapes returned by Tauri (`list_chats`, `list_messages`,
// `insert_message`). Declared locally so this lib has no inbound
// dep on apps/_bindings — the desktop app passes its generated
// `Chat` / `Message` DTOs into these mappers and TypeScript
// structural typing closes the bridge.
export interface ChatDto {
  readonly chat_id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly llm_id: string | null;
  readonly mode: string;
  readonly effort: string;
  readonly last_read_message_id: string | null;
  readonly created_at: number;
}

export interface MessageDto {
  readonly message_id: string;
  readonly chat_id: string;
  readonly role: string;
  readonly content: string;
  readonly mode: string | null;
  readonly status: string;
  readonly created_at: number;
  readonly timeline_json: string | null;
  readonly run_id?: string | null;
}

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
  // `timeline_json` is shared between assistant TurnState and the
  // system_* payloads — discriminated by `role` first and then by the
  // payload's `kind`. Keeps the DB schema unchanged.
  const turnState = role === 'assistant' ? parseTurnState(dto.timeline_json) : undefined;
  const systemInfo = role === 'system' ? parseSystemInfo(dto.timeline_json) : undefined;
  const setupProgress =
    role === 'system' ? parseSetupProgress(dto.timeline_json) : undefined;
  return {
    id: dto.message_id,
    chatId: dto.chat_id,
    role,
    content: dto.content,
    mode: coerceMessageMode(dto.mode),
    status: coerceStatus(dto.status),
    createdAt: dto.created_at,
    runId: dto.run_id ?? undefined,
    turnState,
    systemInfo,
    setupProgress,
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
    const obj = parsed as { kind: 'system_info'; lines?: unknown };
    const lines = Array.isArray(obj.lines)
      ? obj.lines.filter((l): l is string => typeof l === 'string')
      : [];
    return { kind: 'system_info', lines };
  } catch {
    return undefined;
  }
}

export function systemInfoToJson(info: SystemInfo): string {
  return JSON.stringify(info);
}

const ALLOWED_SETUP_STATUSES: ReadonlySet<SetupProgressStatus> = new Set([
  'running',
  'done',
  'failed',
]);

function parseSetupProgress(json: string | null): SetupProgress | undefined {
  if (json == null) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { kind?: unknown }).kind !== 'setup_progress'
    ) {
      return undefined;
    }
    const obj = parsed as {
      kind: 'setup_progress';
      status?: unknown;
      command?: unknown;
      manager?: unknown;
      errorMessage?: unknown;
    };
    const status =
      typeof obj.status === 'string' &&
      ALLOWED_SETUP_STATUSES.has(obj.status as SetupProgressStatus)
        ? (obj.status as SetupProgressStatus)
        : 'running';
    const command = typeof obj.command === 'string' ? obj.command : '';
    const manager =
      typeof obj.manager === 'string' && obj.manager.length > 0
        ? obj.manager
        : undefined;
    const errorMessage =
      typeof obj.errorMessage === 'string' ? obj.errorMessage : undefined;
    return { kind: 'setup_progress', status, command, manager, errorMessage };
  } catch {
    return undefined;
  }
}

export function setupProgressToJson(progress: SetupProgress): string {
  return JSON.stringify(progress);
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
