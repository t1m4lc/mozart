import { Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  createXterm,
  loadXterm,
  resolveXtermTheme,
} from '@mozart/desktop-core-util';
import { ThemeService } from '@mozart/shared-util-theme';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { Subject, debounceTime, groupBy, mergeMap } from 'rxjs';
import { TerminalsFacade } from './terminals.facade';

/** xterm.js + addons + Rust unsubscribe handle for one workspace. */
export interface TerminalEntry {
  readonly term: Terminal;
  readonly fit: FitAddon;
  readonly close: () => Promise<void>;
}

// How long the shell PTY can stay silent before we consider it idle.
const SHELL_IDLE_MS = 1000;

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
  private readonly theme = inject(ThemeService);
  private readonly entries = new Map<string, TerminalEntry>();

  // Any PTY chunk flips the workspace busy synchronously; SHELL_IDLE_MS
  // after the last chunk the per-id debounceTime fires it back to idle.
  private readonly tick$ = new Subject<string>();
  private readonly _busyIds = signal<ReadonlySet<string>>(new Set());
  readonly busyIds = this._busyIds.asReadonly();

  constructor() {
    // Re-apply the xterm theme to every live terminal whenever the
    // active theme/mode changes. Without this, terminals created in
    // light mode keep their light palette after the user flips to
    // dark — which is exactly the "terminal stays light" complaint.
    effect(() => {
      // Subscribe to both signals so a theme swap or mode swap
      // (light ↔ dark) triggers a re-apply.
      this.theme.isDark();
      this.theme.activeTheme();
      const next = resolveXtermTheme();
      for (const entry of this.entries.values()) {
        entry.term.options.theme = next;
      }
    });

    this.tick$
      .pipe(
        groupBy((id) => id),
        mergeMap((group$) => group$.pipe(debounceTime(SHELL_IDLE_MS))),
        takeUntilDestroyed(),
      )
      .subscribe((id) => this.markBusy(id, false));
  }

  /** Idempotent: returns the existing entry for `workspaceId`, or
   *  creates one (instantiates xterm.js + opens the PTY). The
   *  `displayLabel` is embedded literally in PS1/PROMPT so the prompt
   *  always shows the friendly workspace name even when the on-disk
   *  dir was suffixed for collision (e.g. `dylan-2/` but label
   *  `dylan`). Single quotes in the label are escaped defensively. */
  async getOrCreate(
    workspaceId: string,
    displayLabel: string,
  ): Promise<TerminalEntry> {
    const existing = this.entries.get(workspaceId);
    if (existing) return existing;

    // Make sure the xterm.js chunk is loaded. The workspace-detail
    // route guard normally warms the cache before we get here, but
    // calling it directly is the source of truth — and a no-op once
    // resolved.
    await loadXterm();

    // Match the surrounding `bg-sidebar` palette so the terminal doesn't
    // punch a black rectangle through the polished UI. CSS variables are
    // resolved once at instantiation; theme switches re-apply colors via
    // the effect in the constructor.
    const { term, fit } = createXterm({
      readOnly: false,
      theme: resolveXtermTheme(),
    });

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
          this.markBusy(workspaceId, true);
          this.tick$.next(workspaceId);
        } else {
          // 'exited' — dispose the entry so subsequent getOrCreate
          // reopens a fresh PTY.
          this.dispose(workspaceId);
        }
      },
    );

    // Surface the workspace's friendly name literally in PS1/PROMPT
    // (atom 8). The on-disk dir basename can diverge from the
    // user-visible name when collision suffixing kicks in
    // (e.g. workspace named `dylan` lives under `dylan-2/` because
    // another `dylan` was archived first), so we don't trust `\W`
    // anymore. Users who customize their rc file can re-export
    // PS1/PROMPT to whatever they want. Leading space keeps the line
    // out of HISTCONTROL.
    const safeLabel = displayLabel.replace(/'/g, `'\\''`);
    void this.facade
      .write(
        workspaceId,
        ` clear; export PS1='${safeLabel} $ '; export PROMPT='${safeLabel} $ '\n`,
      )
      .catch(() => undefined);

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
    this.markBusy(workspaceId, false);
    try {
      entry.term.dispose();
    } catch (err) {
      console.warn('[terminal] dispose xterm failed:', err);
    }
    void entry.close().catch((err) => {
      console.warn('[terminal] close PTY failed:', err);
    });
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
}
