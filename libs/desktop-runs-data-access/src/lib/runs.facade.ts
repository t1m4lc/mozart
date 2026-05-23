import { Injectable, inject } from '@angular/core';
import type { TerminalEvent } from '@mozart/desktop-terminals-util';
import { RUNS_ADAPTER } from './runs.adapter';

/** Public facade for the `runs` domain. Thin pass-through over the
 *  adapter — the registry service does the stateful work. */
@Injectable({ providedIn: 'root' })
export class RunsFacade {
  private readonly adapter = inject(RUNS_ADAPTER);

  openRun(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: (e: TerminalEvent) => void,
  ): Promise<void> {
    return this.adapter.openRun(workspaceId, cols, rows, onEvent);
  }

  stopRun(workspaceId: string): Promise<void> {
    return this.adapter.stopRun(workspaceId);
  }
}
