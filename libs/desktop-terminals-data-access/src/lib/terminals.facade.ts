import { Injectable, inject } from '@angular/core';
import type { TerminalEvent } from '@mozart/desktop-terminals-util';
import { TERMINALS_ADAPTER } from './terminals.adapter';

/** Public facade for the `terminals` domain. Thin pass-through over
 *  the adapter so feature components don't import the IO port
 *  directly. */
@Injectable({ providedIn: 'root' })
export class TerminalsFacade {
  private readonly adapter = inject(TERMINALS_ADAPTER);

  open(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: (e: TerminalEvent) => void,
  ): Promise<() => Promise<void>> {
    return this.adapter.open(workspaceId, cols, rows, onEvent);
  }

  write(workspaceId: string, data: string): Promise<void> {
    return this.adapter.write(workspaceId, data);
  }

  resize(workspaceId: string, cols: number, rows: number): Promise<void> {
    return this.adapter.resize(workspaceId, cols, rows);
  }
}
