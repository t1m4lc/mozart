import { InjectionToken } from '@angular/core';
import type { TerminalEvent } from '@mozart/desktop-terminals-util';

// Port for the onboarding wizard's Claude Code login flow. Wraps the
// `spawn_claude_login` + `write_terminal` / `resize_terminal` /
// `close_terminal` Tauri commands. The PTY is rooted at the user's
// HOME directory ; output streams via the `onEvent` callback (same
// shape as the workspace terminal). On Exited the feature re-probes
// the Claude Code session via `ProfileFacade.tryConnect()`.
export interface ProviderSetupAdapter {
  /**
   * Spawn `claude login` in a PTY. Resolves to a `close()` callback the
   * feature invokes on teardown (Cancel button or successful detection).
   * `onEvent` fires for every chunk of output and once with `exited`.
   */
  spawnClaudeLogin(
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<{ terminalId: string; close: () => Promise<void> }>;

  /** Spawn `codex login` in a PTY. Same contract as `spawnClaudeLogin`;
   *  on Exited the feature re-probes via `ProfileFacade.tryConnectCodex()`. */
  spawnCodexLogin(
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<{ terminalId: string; close: () => Promise<void> }>;

  /** Forward bytes (typed by the user via xterm.js) to the PTY's stdin. */
  write(terminalId: string, data: string): Promise<void>;

  /** Inform the PTY of the host viewport's new dimensions. */
  resize(terminalId: string, cols: number, rows: number): Promise<void>;

  /** Probe whether the `claude` CLI is installed and on PATH. Runs
   *  `claude --version` argv-form with a hard timeout — no shell, no
   *  visible window. Used to gate the login PTY so we never spawn into a
   *  `command not found` loop. */
  claudeInstalled(): Promise<boolean>;

  /** Codex's parallel to `claudeInstalled()` (`codex --version`). */
  codexInstalled(): Promise<boolean>;
}

export const PROVIDER_SETUP_ADAPTER = new InjectionToken<ProviderSetupAdapter>(
  'PROVIDER_SETUP_ADAPTER',
);
