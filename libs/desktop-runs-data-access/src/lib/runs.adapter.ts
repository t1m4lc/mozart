import { InjectionToken } from '@angular/core';
import type { TerminalEvent } from '@mozart/desktop-terminals-util';

/**
 * IO port for the `runs` domain. Spawns / stops the project's
 * `run_command` PTY (Phase 4e). Output events match the shell PTY's
 * `TerminalEvent` shape because both go through the same Rust
 * machinery.
 */
export interface RunsAdapter {
  openRun(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<void>;

  /** Spawn the setup_command PTY. Same lifecycle + event shape as
   *  `openRun`; the registry shares one xterm between the two. */
  openSetup(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: (event: TerminalEvent) => void,
  ): Promise<void>;

  stopRun(workspaceId: string): Promise<void>;
}

export const RUNS_ADAPTER = new InjectionToken<RunsAdapter>('RUNS_ADAPTER');
