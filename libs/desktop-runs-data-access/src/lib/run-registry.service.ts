import { Injectable, WritableSignal, effect, inject, signal } from '@angular/core';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { createXterm, resolveXtermTheme } from '@mozart/desktop-core-util';
import { ThemeService } from '@mozart/shared-util-theme';
import { RunsFacade } from './runs.facade';
import type { RunStatus } from '@mozart/desktop-runs-util';

// Matches dev-server URLs commonly printed by Node/Vite/Webpack/etc.
// Captures the first such URL in a chunk; the host MUST be a loopback
// (localhost / 127.0.0.1 / [::1]) so production URLs in stack traces
// don't get surfaced as "open this". The path terminator class
// stops at whitespace, quotes, and brackets — enough to peel the URL
// out of typical log lines even when neighboring text is ANSI-styled.
const LOCALHOST_URL_RE =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s"'<>`]*)?/i;

export interface RunEntry {
  readonly term: Terminal;
  readonly fit: FitAddon;
  readonly status: WritableSignal<RunStatus>;
  /** Latest dev-server URL detected in the output. Cleared when the
   *  command restarts; preserved on `exited` so the user can still
   *  click the link after the process stops. Setup entries hold this
   *  signal too but it's effectively unused (install commands don't
   *  print URLs). */
  readonly detectedUrl: WritableSignal<string | null>;
}

type PtyKind = 'run' | 'setup';

/** Per-workspace xterm (read-only output) + status signal. Setup and
 *  run get separate entries so their xterms (and statuses) never share
 *  bytes — setup output stays in the Setup tab, run output stays in
 *  the Run tab. The PTY itself is managed Rust-side; the registry only
 *  guards against starting one kind while the other is still alive. */
@Injectable({ providedIn: 'root' })
export class RunRegistry {
  private readonly facade = inject(RunsFacade);
  private readonly theme = inject(ThemeService);
  private readonly runEntries = new Map<string, RunEntry>();
  private readonly setupEntries = new Map<string, RunEntry>();

  constructor() {
    // Re-apply the xterm palette whenever the active theme/mode flips
    // so the Run/Setup terminals stay in sync with the rest of the app.
    // Mirrors TerminalRegistry's effect.
    effect(() => {
      this.theme.isDark();
      this.theme.activeTheme();
      const next = resolveXtermTheme();
      for (const map of [this.runEntries, this.setupEntries]) {
        for (const entry of map.values()) {
          entry.term.options.theme = next;
        }
      }
    });
  }

  /** Run-command entry (creates if needed). Does NOT spawn a PTY —
   *  call `start` for that. */
  ensureEntry(workspaceId: string): RunEntry {
    return this.ensureSlot('run', workspaceId);
  }

  /** Setup-command entry — separate xterm + status from the run
   *  entry. */
  ensureSetupEntry(workspaceId: string): RunEntry {
    return this.ensureSlot('setup', workspaceId);
  }

  /** Spawn the project's run command via Rust. No-op if either the
   *  run or the setup is already running for this workspace (only one
   *  PTY can be alive at a time). */
  async start(workspaceId: string): Promise<void> {
    if (this.isBusy(workspaceId)) return;
    const entry = this.ensureEntry(workspaceId);
    // A fresh run starts with no URL — yesterday's `localhost:3000`
    // shouldn't be clickable while the new process is still booting.
    entry.detectedUrl.set(null);
    entry.status.set('running');
    try {
      await this.facade.openRun(
        workspaceId,
        entry.term.cols,
        entry.term.rows,
        (ev) => this.handleEvent(entry, ev),
      );
    } catch (err) {
      entry.status.set('idle');
      throw err;
    }
  }

  /** Spawn the project's setup command (install / prepare). Same
   *  exclusivity rule as `start` — refuses if a run is already
   *  underway. Output streams into the dedicated setup xterm. */
  async startSetup(workspaceId: string): Promise<void> {
    if (this.isBusy(workspaceId)) return;
    const entry = this.ensureSetupEntry(workspaceId);
    entry.status.set('running');
    try {
      await this.facade.openSetup(
        workspaceId,
        entry.term.cols,
        entry.term.rows,
        (ev) => this.handleEvent(entry, ev),
      );
    } catch (err) {
      entry.status.set('idle');
      throw err;
    }
  }

  /** Kill whichever PTY is alive (run or setup). The `exited` event
   *  flips the matching entry's status. */
  async stop(workspaceId: string): Promise<void> {
    const run = this.runEntries.get(workspaceId);
    const setup = this.setupEntries.get(workspaceId);
    if (run?.status() !== 'running' && setup?.status() !== 'running') return;
    try {
      await this.facade.stopRun(workspaceId);
    } catch (err) {
      console.warn('[run] stopRun failed:', err);
    }
  }

  /** True when either the run or the setup PTY is currently
   *  executing. Consumers use this to gate "Run" / "Start setup"
   *  buttons so the user can't start a second PTY mid-flight. */
  isBusy(workspaceId: string): boolean {
    return (
      this.runEntries.get(workspaceId)?.status() === 'running' ||
      this.setupEntries.get(workspaceId)?.status() === 'running'
    );
  }

  /** Tear down everything for a workspace (xterm + map entries). The
   *  Rust side cleans up the PTY on archive separately. */
  dispose(workspaceId: string): void {
    for (const map of [this.runEntries, this.setupEntries]) {
      const entry = map.get(workspaceId);
      if (!entry) continue;
      map.delete(workspaceId);
      try {
        entry.term.dispose();
      } catch (err) {
        console.warn('[run] dispose xterm failed:', err);
      }
    }
  }

  private ensureSlot(kind: PtyKind, workspaceId: string): RunEntry {
    const map = kind === 'run' ? this.runEntries : this.setupEntries;
    let entry = map.get(workspaceId);
    if (entry) return entry;
    const { term, fit } = createXterm({
      readOnly: true,
      theme: resolveXtermTheme(),
    });
    entry = {
      term,
      fit,
      status: signal<RunStatus>('idle'),
      detectedUrl: signal<string | null>(null),
    };
    map.set(workspaceId, entry);
    return entry;
  }

  private handleEvent(
    entry: RunEntry,
    ev: { kind: 'output'; data: string } | { kind: 'exited'; code: number },
  ): void {
    if (ev.kind === 'output') {
      entry.term.write(ev.data);
      // Lazy URL detection — skip the regex once we've already
      // surfaced a match, and ignore further "Network:" lines so the
      // chip stays anchored to the first URL printed.
      if (entry.detectedUrl() === null) {
        const match = ev.data.match(LOCALHOST_URL_RE);
        if (match) {
          entry.detectedUrl.set(match[0]);
        }
      }
    } else {
      entry.status.set('exited');
    }
  }
}
