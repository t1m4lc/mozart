import { Injectable, inject } from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { TerminalsFacade } from './terminals.facade';

/** xterm.js + addons + Rust unsubscribe handle for one workspace. */
export interface TerminalEntry {
  readonly term: Terminal;
  readonly fit: FitAddon;
  readonly close: () => Promise<void>;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Per-workspace xterm.js + PTY lifetime manager. Lives at app scope so
 * Terminal instances survive workspace switches and tab toggles. The
 * paired PTY on the Rust side persists too — Rust drops it via
 * `archive_workspace`, which fires a synthesized `exited` event back
 * here and triggers `dispose(workspaceId)`.
 */
@Injectable({ providedIn: 'root' })
export class TerminalRegistry {
  private readonly facade = inject(TerminalsFacade);
  private readonly entries = new Map<string, TerminalEntry>();

  /** Idempotent: returns the existing entry for `workspaceId`, or
   *  creates one (instantiates xterm.js + opens the PTY). */
  async getOrCreate(workspaceId: string): Promise<TerminalEntry> {
    const existing = this.entries.get(workspaceId);
    if (existing) return existing;

    const term = new Terminal({
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cursorBlink: true,
      convertEol: true,
      // Tail xterm's defaults; theme tokens picked up via CSS
      // overrides if the consumer wants them.
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // Pipe user keystrokes to the PTY.
    term.onData((data) => {
      void this.facade.write(workspaceId, data).catch((err) => {
        console.warn('[terminal] write failed:', err);
      });
    });

    // Pipe xterm-driven resize back to the PTY (e.g. fit() called when
    // the host element resizes).
    term.onResize(({ cols, rows }) => {
      void this.facade.resize(workspaceId, cols, rows).catch((err) => {
        console.warn('[terminal] resize failed:', err);
      });
    });

    const close = await this.facade.open(
      workspaceId,
      term.cols,
      term.rows,
      (event) => {
        if (event.kind === 'output') {
          term.write(event.data);
        } else {
          // 'exited' — dispose the entry so subsequent getOrCreate
          // reopens a fresh PTY.
          this.dispose(workspaceId);
        }
      },
    );

    const entry: TerminalEntry = { term, fit, close };
    this.entries.set(workspaceId, entry);
    return entry;
  }

  /** Tear down xterm + PTY for a workspace. Called when the Rust side
   *  signals `exited` (or the workspace is archived). Idempotent. */
  dispose(workspaceId: string): void {
    const entry = this.entries.get(workspaceId);
    if (!entry) return;
    this.entries.delete(workspaceId);
    try {
      entry.term.dispose();
    } catch (err) {
      console.warn('[terminal] dispose xterm failed:', err);
    }
    void entry.close().catch((err) => {
      console.warn('[terminal] close PTY failed:', err);
    });
  }
}
