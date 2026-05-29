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

// Broader "the dev server is up" signal. Flips `starting` → `running`
// so the Run button stops showing a loader once the process announces
// itself. Covers a loopback host/URL plus the common ready phrases
// Vite/Next/webpack/node print (`Local:`, `Listening on`, `ready in`).
const SERVER_READY_RE =
  /\b(?:localhost|127\.0\.0\.1|\[::1\]|listening(?: on)?|local:|ready in|server (?:running|started)|started server)\b/i;

// Strip ANSI/VT escape sequences so URL + ready detection runs against
// plain text. Dev servers colorize their output — Vite even bolds the
// port (`localhost:\x1b[1m5173`), which otherwise splits the URL and
// breaks the regexes (the cause of the missing "Open localhost" button).
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

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
  /** Exit code from the last `exited` event, or null while the PTY is
   *  idle/alive. Lets the setup lifecycle distinguish a successful
   *  install (code 0) from a failed one — a non-zero exit must NOT be
   *  reported as "dependencies installed". */
  readonly exitCode: WritableSignal<number | null>;
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

  // Workspace ids that are mid-transition (run `starting` or setup
  // running). Reactive — sidebar rows subscribe to drive a spinner.
  // Clears once a run reaches the steady `running` state (see
  // `recomputeBusy` / `isLoading`) so the row stops looking like it's
  // still loading.
  private readonly _busyIds = signal<ReadonlySet<string>>(new Set());
  readonly busyIds = this._busyIds.asReadonly();

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
    entry.exitCode.set(null);
    // `starting` (not `running`) so the UI shows a loader only while the
    // command boots; the first ready-signal in the output flips it to
    // `running`. See handleEvent.
    entry.status.set('starting');
    this.markBusy(workspaceId, true);
    try {
      await this.facade.openRun(
        workspaceId,
        entry.term.cols,
        entry.term.rows,
        (ev) => this.handleEvent(workspaceId, entry, ev),
      );
    } catch (err) {
      entry.status.set('idle');
      this.recomputeBusy(workspaceId);
      throw err;
    }
  }

  /** Spawn the project's setup command (install / prepare). Same
   *  exclusivity rule as `start` — refuses if a run is already
   *  underway. Output streams into the dedicated setup xterm.
   *
   *  Unlike `start`, this promise resolves only when the PTY *exits*
   *  (setup commands are finite: install, build, etc.). Callers that
   *  need to chain follow-up work — e.g. `WorkspacesFacade.runInstall`
   *  flipping `installFor` to `'success'` — await it; the Setup tab's
   *  button stays disabled (`canStart` reads `isBusy`) until exit. */
  async startSetup(workspaceId: string): Promise<void> {
    if (this.isBusy(workspaceId)) return;
    const entry = this.ensureSetupEntry(workspaceId);
    entry.exitCode.set(null);
    entry.status.set('running');
    this.markBusy(workspaceId, true);

    const exited = new Promise<void>((resolve) => {
      const queue = this.setupExitWaiters.get(workspaceId) ?? [];
      queue.push(resolve);
      this.setupExitWaiters.set(workspaceId, queue);
    });

    try {
      await this.facade.openSetup(
        workspaceId,
        entry.term.cols,
        entry.term.rows,
        (ev) => {
          this.handleEvent(workspaceId, entry, ev);
          if (ev.kind === 'exited') this.flushSetupExits(workspaceId);
        },
      );
    } catch (err) {
      entry.status.set('idle');
      this.recomputeBusy(workspaceId);
      this.flushSetupExits(workspaceId);
      throw err;
    }

    await exited;
  }

  // One-shot exit waiters: `startSetup` awaits these so its promise
  // resolves on the PTY's actual exit (not just the spawn ack).
  private readonly setupExitWaiters = new Map<string, Array<() => void>>();

  private flushSetupExits(workspaceId: string): void {
    const queue = this.setupExitWaiters.get(workspaceId);
    if (!queue) return;
    this.setupExitWaiters.delete(workspaceId);
    for (const resolve of queue) resolve();
  }

  /** Kill whichever PTY is alive (run or setup). The `exited` event
   *  flips the matching entry's status. */
  async stop(workspaceId: string): Promise<void> {
    const run = this.runEntries.get(workspaceId);
    const setup = this.setupEntries.get(workspaceId);
    if (!isLive(run) && !isLive(setup)) return;
    try {
      await this.facade.stopRun(workspaceId);
    } catch (err) {
      console.warn('[run] stopRun failed:', err);
    }
  }

  /** True when either the run or the setup PTY is currently alive
   *  (starting or running). Consumers use this to gate "Run" / "Start
   *  setup" buttons so the user can't start a second PTY mid-flight. */
  isBusy(workspaceId: string): boolean {
    return (
      isLive(this.runEntries.get(workspaceId)) ||
      isLive(this.setupEntries.get(workspaceId))
    );
  }

  /** True only while something is *transitioning* and worth a spinner:
   *  a run that's still booting (`starting`), or a setup/install PTY
   *  mid-flight. A steadily `running` dev server is NOT loading — this
   *  is what drives the sidebar row's spinner, so it must clear once the
   *  server is up. */
  private isLoading(workspaceId: string): boolean {
    return (
      this.runEntries.get(workspaceId)?.status() === 'starting' ||
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
      exitCode: signal<number | null>(null),
    };
    map.set(workspaceId, entry);
    return entry;
  }

  private handleEvent(
    workspaceId: string,
    entry: RunEntry,
    ev: { kind: 'output'; data: string } | { kind: 'exited'; code: number },
  ): void {
    if (ev.kind === 'output') {
      entry.term.write(ev.data);
      // Run detection against ANSI-stripped text — colorized output
      // (and Vite's bolded port) otherwise hides the URL / ready signal.
      const plain = stripAnsi(ev.data);
      // Lazy URL detection — skip the regex once we've already
      // surfaced a match, and ignore further "Network:" lines so the
      // chip stays anchored to the first URL printed.
      if (entry.detectedUrl() === null) {
        const match = plain.match(LOCALHOST_URL_RE);
        if (match) {
          entry.detectedUrl.set(match[0]);
        }
      }
      // Clear the loader once the server announces itself: flip
      // `starting` → `running` and recompute busy so the sidebar row
      // stops spinning while the dev server runs steadily. Only the run
      // entry transitions through `starting`.
      if (
        entry.status() === 'starting' &&
        (entry.detectedUrl() !== null || SERVER_READY_RE.test(plain))
      ) {
        entry.status.set('running');
        this.recomputeBusy(workspaceId);
      }
    } else {
      entry.exitCode.set(ev.code);
      entry.status.set('exited');
      this.recomputeBusy(workspaceId);
    }
  }

  private markBusy(workspaceId: string, on: boolean): void {
    const current = this._busyIds();
    const has = current.has(workspaceId);
    if (on === has) return;
    const next = new Set(current);
    if (on) next.add(workspaceId);
    else next.delete(workspaceId);
    this._busyIds.set(next);
  }

  // Re-derive the sidebar spinner state for `workspaceId`. Driven by
  // `isLoading` (transitional), NOT `isBusy` (alive) — a running dev
  // server should not keep the row spinning.
  private recomputeBusy(workspaceId: string): void {
    this.markBusy(workspaceId, this.isLoading(workspaceId));
  }
}

// A PTY counts as "live" while it's spawning (`starting`) or up
// (`running`) — both block a second PTY (the start/stop guard).
function isLive(entry: RunEntry | undefined): boolean {
  const s = entry?.status();
  return s === 'running' || s === 'starting';
}
