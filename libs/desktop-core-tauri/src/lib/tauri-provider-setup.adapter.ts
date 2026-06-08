import { Channel } from '@tauri-apps/api/core';
import { commands, type TerminalEvent as TerminalEventDto } from './_bindings';
import type { ProviderSetupAdapter } from '@mozart/desktop-onboarding-data-access';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed ProviderSetupAdapter. Bridges the Rust
// `TerminalEvent` (`output | exited`) onto the front-end `TerminalEvent`
// model defined under `domains/terminals/`. Reuses the terminal
// registry's existing write/resize/close commands keyed by the
// synthetic id returned from `spawn_claude_login`.
export function tauriProviderSetupAdapter(): ProviderSetupAdapter {
  return {
    async spawnClaudeLogin(cols, rows, onEvent) {
      const channel = new Channel<TerminalEventDto>();
      channel.onmessage = (ev) => {
        if (ev.kind === 'output') onEvent({ kind: 'output', data: ev.data });
        else onEvent({ kind: 'exited', code: ev.code });
      };
      const terminalId = unwrap(
        await commands.spawnClaudeLogin(cols, rows, channel),
      );
      const close = async (): Promise<void> => {
        try {
          unwrap(await commands.closeTerminal(terminalId));
        } catch (err) {
          console.warn('[onboarding] close claude-login PTY failed:', err);
        }
      };
      return { terminalId, close };
    },
    async spawnCodexLogin(cols, rows, onEvent) {
      const channel = new Channel<TerminalEventDto>();
      channel.onmessage = (ev) => {
        if (ev.kind === 'output') onEvent({ kind: 'output', data: ev.data });
        else onEvent({ kind: 'exited', code: ev.code });
      };
      const terminalId = unwrap(
        await commands.spawnCodexLogin(cols, rows, channel),
      );
      const close = async (): Promise<void> => {
        try {
          unwrap(await commands.closeTerminal(terminalId));
        } catch (err) {
          console.warn('[onboarding] close codex-login PTY failed:', err);
        }
      };
      return { terminalId, close };
    },
    async write(terminalId, data) {
      unwrap(await commands.writeTerminal(terminalId, data));
    },
    async resize(terminalId, cols, rows) {
      unwrap(await commands.resizeTerminal(terminalId, cols, rows));
    },
    async claudeInstalled() {
      return (await commands.checkClaudeInstall()).kind === 'installed';
    },
    async codexInstalled() {
      return (await commands.checkCodexInstall()).kind === 'installed';
    },
  };
}
