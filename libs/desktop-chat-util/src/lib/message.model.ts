import type { TurnState } from '@mozart/desktop-llm-model-util';
import type { ChatMode } from './chat.model';

export type MessageRole = 'user' | 'assistant' | 'system';

// Lifecycle phases. User messages emit `done` (or `queued` if a turn
// is already in flight); assistant messages cycle through `streaming`
// → `done` / `stopped` / `error`.
export type MessageStatus =
  | 'pending'
  | 'queued'
  | 'streaming'
  | 'done'
  | 'error'
  | 'stopped';

// Subtle muted card emitted by the backend at project bootstrap time.
// One per "Start" chat; read-only — not editable, not deletable. Carried
// on `Message` only when `role === 'system'` and `kind === 'system_info'`.
//
// `lines` holds short conversational sentences ("Branched … from … in …",
// "<workspace> ready with 0 files.", tagline). The renderer shows them as
// stacked paragraphs — no dotted bullet glyph.
export interface SystemInfo {
  readonly kind: 'system_info';
  readonly lines: readonly string[];
}

// Bootstrap setup lifecycle. Backend writes the entry in `running` state
// at Open-project time when a setup command is known. The frontend flips
// it to `done` / `failed` once `runInstall` resolves (via the existing
// `update_message_timeline` Tauri command).
export type SetupProgressStatus = 'running' | 'done' | 'failed';

export interface SetupProgress {
  readonly kind: 'setup_progress';
  readonly status: SetupProgressStatus;
  readonly command: string;
  /**
   * Toolchain name used in the rendered copy ("Installed dependencies
   * with pnpm."). Empty string when not known — renderer falls back to
   * the bare command.
   */
  readonly manager?: string;
  /** Set on failed runs when the backend has a reason to surface. */
  readonly errorMessage?: string;
}

export interface Message {
  readonly id: string;
  readonly chatId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly mode?: ChatMode;
  readonly status: MessageStatus;
  readonly createdAt: number;
  // Assistant only — accumulated state of the agent's turn. Phase 3a
  // reads `.text` via <message-body>; Phase 3b will render the full
  // Claude-style timeline from `.items` + `.summary` + `.outcome`.
  readonly turnState?: TurnState;
  // System only — present when this row is the bootstrap "Project ready"
  // entry. See P0.3 (R0.3.F).
  readonly systemInfo?: SystemInfo;
  // System only — present when this row tracks the bootstrap setup
  // lifecycle (P0.3 / R0.3.E). Mutable via update_message_timeline.
  readonly setupProgress?: SetupProgress;
}
