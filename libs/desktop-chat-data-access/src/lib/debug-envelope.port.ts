import { InjectionToken } from '@angular/core';

// Dev-only debug inspector port + domain shapes. Mirrors the Rust
// `AgentRunEnvelope` + `LLMEnvelope` (see _bindings.ts), re-declared here
// so feature/UI code reads a domain type rather than the generated
// binding. The Tauri impl (desktop-core-tauri) maps the DTO — including
// JSON-parsing `envelope_json` — into `DebugRunEnvelope`.

export interface DebugSystemRulesLayer {
  readonly mode: string;
  readonly sandboxLevel: string;
  readonly authorityClamp: string;
}

export interface DebugWorkspaceStateLayer {
  readonly workspacePath: string;
  readonly branchName: string;
  readonly baseBranch: string;
  readonly siblingPaths: readonly string[];
}

export interface DebugConversationTurn {
  readonly messageId: string;
  readonly role: string;
  readonly content: string;
  readonly mode: string | null;
  readonly createdAt: number;
}

export interface DebugOperationalSummary {
  readonly runId: string;
  readonly messageId: string;
  readonly textSummary: string;
  readonly filesRead: readonly string[];
  readonly filesEdited: readonly string[];
  readonly commandsRun: readonly string[];
  readonly keyResults: readonly string[];
  readonly createdAt: number;
}

export interface DebugAttachedContextItem {
  readonly kind: string;
  readonly label: string;
  readonly content: string;
}

export interface DebugCurrentUserMessage {
  readonly messageId: string;
  readonly content: string;
  readonly mode: string | null;
  readonly createdAt: number;
}

// The 7-layer context, parsed from `envelope_json`.
export interface DebugEnvelopeLayers {
  readonly systemRules: DebugSystemRulesLayer;
  readonly projectMemory: readonly string[];
  readonly workspaceState: DebugWorkspaceStateLayer;
  readonly recentConversation: readonly DebugConversationTurn[];
  readonly operationalSummaries: readonly DebugOperationalSummary[];
  readonly attachedContext: readonly DebugAttachedContextItem[];
  readonly currentUserMessage: DebugCurrentUserMessage;
}

export interface DebugRunEnvelope {
  readonly runId: string;
  readonly chatId: string;
  readonly provider: string;
  readonly nonce: string;
  readonly charCount: number;
  readonly estTokens: number;
  readonly createdAt: number;
  // Exact nonce-framed payload piped to the provider CLI.
  readonly renderedText: string;
  // Structured layers, or null when `envelope_json` failed to parse.
  readonly layers: DebugEnvelopeLayers | null;
}

export interface DebugEnvelopePort {
  getRunEnvelope(runId: string): Promise<DebugRunEnvelope | null>;
}

export const DEBUG_ENVELOPE_PORT = new InjectionToken<DebugEnvelopePort>(
  'DEBUG_ENVELOPE_PORT',
);

// Raw wire shape (structural — avoids an inbound dep on apps/_bindings).
export interface AgentRunEnvelopeDto {
  readonly run_id: string;
  readonly chat_id: string;
  readonly provider: string;
  readonly nonce: string;
  readonly char_count: number;
  readonly est_tokens: number;
  readonly created_at: number;
  readonly rendered_text: string;
  readonly envelope_json: string;
}

export function debugEnvelopeFromDto(
  dto: AgentRunEnvelopeDto,
): DebugRunEnvelope {
  return {
    runId: dto.run_id,
    chatId: dto.chat_id,
    provider: dto.provider,
    nonce: dto.nonce,
    charCount: dto.char_count,
    estTokens: dto.est_tokens,
    createdAt: dto.created_at,
    renderedText: dto.rendered_text,
    layers: parseLayers(dto.envelope_json),
  };
}

function parseLayers(json: string): DebugEnvelopeLayers | null {
  try {
    const e = JSON.parse(json) as RawEnvelope;
    return {
      systemRules: {
        mode: e.system_rules.mode,
        sandboxLevel: e.system_rules.sandbox_level,
        authorityClamp: e.system_rules.authority_clamp,
      },
      projectMemory: e.project_memory.items ?? [],
      workspaceState: {
        workspacePath: e.workspace_state.workspace_path,
        branchName: e.workspace_state.branch_name,
        baseBranch: e.workspace_state.base_branch,
        siblingPaths: e.workspace_state.sibling_paths ?? [],
      },
      recentConversation: (e.recent_conversation.turns ?? []).map((t) => ({
        messageId: t.message_id,
        role: t.role,
        content: t.content,
        mode: t.mode ?? null,
        createdAt: t.created_at,
      })),
      operationalSummaries: (e.operational_summaries.summaries ?? []).map(
        (s) => ({
          runId: s.run_id,
          messageId: s.message_id,
          textSummary: s.text_summary,
          filesRead: s.files_read ?? [],
          filesEdited: s.files_edited ?? [],
          commandsRun: s.commands_run ?? [],
          keyResults: s.key_results ?? [],
          createdAt: s.created_at,
        }),
      ),
      attachedContext: (e.attached_context.items ?? []).map((i) => ({
        kind: i.kind,
        label: i.label,
        content: i.content,
      })),
      currentUserMessage: {
        messageId: e.current_user_message.message_id,
        content: e.current_user_message.content,
        mode: e.current_user_message.mode ?? null,
        createdAt: e.current_user_message.created_at,
      },
    };
  } catch {
    return null;
  }
}

interface RawEnvelope {
  system_rules: {
    mode: string;
    sandbox_level: string;
    authority_clamp: string;
  };
  project_memory: { items?: string[] };
  workspace_state: {
    workspace_path: string;
    branch_name: string;
    base_branch: string;
    sibling_paths?: string[];
  };
  recent_conversation: {
    turns?: Array<{
      message_id: string;
      role: string;
      content: string;
      mode?: string | null;
      created_at: number;
    }>;
  };
  operational_summaries: {
    summaries?: Array<{
      run_id: string;
      message_id: string;
      text_summary: string;
      files_read?: string[];
      files_edited?: string[];
      commands_run?: string[];
      key_results?: string[];
      created_at: number;
    }>;
  };
  attached_context: {
    items?: Array<{ kind: string; label: string; content: string }>;
  };
  current_user_message: {
    message_id: string;
    content: string;
    mode?: string | null;
    created_at: number;
  };
}
