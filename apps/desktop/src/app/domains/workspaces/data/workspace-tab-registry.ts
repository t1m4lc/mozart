import { Injectable } from '@angular/core';

export type WorkspaceTabKind =
  | 'chat'
  | 'file'
  | 'run'
  | 'terminal'
  | 'review';

export interface ChatWorkspaceTab {
  readonly kind: 'chat';
  readonly tabId: string;
  readonly payload: string;
  readonly chatId: string;
}

export interface FileWorkspaceTab {
  readonly kind: 'file';
  readonly tabId: string;
  readonly payload: string;
  readonly path: string;
}

export interface RunWorkspaceTab {
  readonly kind: 'run';
  readonly tabId: string;
  readonly payload: string;
  readonly runId: string;
}

export interface TerminalWorkspaceTab {
  readonly kind: 'terminal';
  readonly tabId: string;
  readonly payload: string;
  readonly terminalId: string;
}

export interface ReviewWorkspaceTab {
  readonly kind: 'review';
  readonly tabId: string;
  readonly payload: string;
  readonly reviewId: string;
}

export type WorkspaceTab =
  | ChatWorkspaceTab
  | FileWorkspaceTab
  | RunWorkspaceTab
  | TerminalWorkspaceTab
  | ReviewWorkspaceTab;

const OPAQUE_ID_RE = /^[A-Za-z0-9._-]+$/;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function isTabKind(value: string): value is WorkspaceTabKind {
  return (
    value === 'chat' ||
    value === 'file' ||
    value === 'run' ||
    value === 'terminal' ||
    value === 'review'
  );
}

function toBase64Url(input: string): string {
  const bytes = TEXT_ENCODER.encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string | null {
  try {
    const base64 = input
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(input.length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return TEXT_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

function normalizeWorkspaceRelativePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\0')) return null;

  const normalized = trimmed.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return null;
  }

  const parts = normalized.split('/');
  if (
    parts.length === 0 ||
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.includes('\0'),
    )
  ) {
    return null;
  }

  return parts.join('/');
}

export function workspaceRouteCommands(
  projectId: string,
  workspaceId: string,
): string[] {
  return ['/project', projectId, 'workspace', workspaceId];
}

export function workspaceTabRouteCommands(
  projectId: string,
  workspaceId: string,
  tabId: string,
): string[] {
  return ['/project', projectId, 'workspace', workspaceId, 'tab', tabId];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceTabRegistry {
  chatTabId(chatId: string): string {
    return `chat:${chatId}`;
  }

  fileTabId(path: string): string | null {
    const normalized = normalizeWorkspaceRelativePath(path);
    if (!normalized) return null;
    return `file:${toBase64Url(normalized)}`;
  }

  parse(tabId: string): WorkspaceTab | null {
    const divider = tabId.indexOf(':');
    if (divider <= 0) return null;
    const kindRaw = tabId.slice(0, divider);
    if (!isTabKind(kindRaw)) return null;

    const payload = tabId.slice(divider + 1);
    if (!payload) return null;

    if (kindRaw === 'file') {
      const decoded = fromBase64Url(payload);
      if (!decoded) return null;
      const normalized = normalizeWorkspaceRelativePath(decoded);
      if (!normalized) return null;
      return {
        kind: 'file',
        tabId,
        payload,
        path: normalized,
      };
    }

    if (!OPAQUE_ID_RE.test(payload)) return null;

    if (kindRaw === 'chat') {
      return {
        kind: 'chat',
        tabId,
        payload,
        chatId: payload,
      };
    }
    if (kindRaw === 'run') {
      return {
        kind: 'run',
        tabId,
        payload,
        runId: payload,
      };
    }
    if (kindRaw === 'terminal') {
      return {
        kind: 'terminal',
        tabId,
        payload,
        terminalId: payload,
      };
    }
    return {
      kind: 'review',
      tabId,
      payload,
      reviewId: payload,
    };
  }
}
