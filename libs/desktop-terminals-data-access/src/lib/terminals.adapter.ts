import { InjectionToken } from '@angular/core';
import type { TerminalEvent } from '@mozart/desktop-terminals-util';

/**
 * IO port for the `terminals` domain. The Tauri implementation lives
 * in `core/tauri-adapters.ts::provideTerminalsAdapter()` and is the
 * only place that imports `@tauri-apps/api/core`.
 */
export interface TerminalsAdapter {
  /**
   * Open (or replace) the workspace's PTY. Resolves to an unsubscribe
   * callback the caller invokes on teardown — calling it sends a
   * `closeTerminal` to Rust, which kills the child + drops the master.
   * The PTY is rooted at the workspace's worktree.
   *
   * `onEvent` fires for every chunk of output and once with `exited`.
   */
  open(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<() => Promise<void>>;

  /** Send bytes (typed by the user) to the PTY's stdin. */
  write(workspaceId: string, data: string): Promise<void>;

  /** Inform the PTY of the host viewport's new dimensions. */
  resize(workspaceId: string, cols: number, rows: number): Promise<void>;
}

export const TERMINALS_ADAPTER = new InjectionToken<TerminalsAdapter>(
  'TERMINALS_ADAPTER',
);
