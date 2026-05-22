import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { createXterm } from '../../../core/util-xterm';
import { RunsFacade } from './runs.facade';
import type { RunStatus } from './run-status.model';

export interface RunEntry {
  readonly term: Terminal;
  readonly fit: FitAddon;
  readonly status: WritableSignal<RunStatus>;
}

/** Per-workspace xterm (read-only output) + status signal. Lives at
 *  app scope so output and status survive tab toggles and workspace
 *  switches. The PTY itself is managed Rust-side. */
@Injectable({ providedIn: 'root' })
export class RunRegistry {
  private readonly facade = inject(RunsFacade);
  private readonly entries = new Map<string, RunEntry>();

  /** Return (creating if needed) the entry for a workspace. Does NOT
   *  spawn a PTY — call `start` for that. */
  ensureEntry(workspaceId: string): RunEntry {
    let entry = this.entries.get(workspaceId);
    if (entry) return entry;
    const { term, fit } = createXterm({ readOnly: true });
    entry = { term, fit, status: signal<RunStatus>('idle') };
    this.entries.set(workspaceId, entry);
    return entry;
  }

  /** Spawn the project's run command via Rust. No-op if already
   *  running for this workspace. */
  async start(workspaceId: string): Promise<void> {
    const entry = this.ensureEntry(workspaceId);
    if (entry.status() === 'running') return;
    entry.status.set('running');
    try {
      await this.facade.openRun(
        workspaceId,
        entry.term.cols,
        entry.term.rows,
        (ev) => {
          if (ev.kind === 'output') {
            entry.term.write(ev.data);
          } else {
            entry.status.set('exited');
          }
        },
      );
    } catch (err) {
      entry.status.set('idle');
      throw err;
    }
  }

  /** Kill the PTY. Resolution to `exited` arrives via the event
   *  handler installed by `start`. */
  async stop(workspaceId: string): Promise<void> {
    const entry = this.entries.get(workspaceId);
    if (!entry) return;
    if (entry.status() !== 'running') return;
    try {
      await this.facade.stopRun(workspaceId);
    } catch (err) {
      console.warn('[run] stopRun failed:', err);
    }
  }

  /** Tear down everything for a workspace (xterm + map entry). The
   *  Rust side cleans up the PTY on archive separately. */
  dispose(workspaceId: string): void {
    const entry = this.entries.get(workspaceId);
    if (!entry) return;
    this.entries.delete(workspaceId);
    try {
      entry.term.dispose();
    } catch (err) {
      console.warn('[run] dispose xterm failed:', err);
    }
  }
}
