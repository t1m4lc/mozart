import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { loadXterm } from '../../core/util-xterm';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { PROVIDER_SETUP_ADAPTER } from './data/provider-setup.adapter';

// Sub-step opened when the user clicks "Configure Claude Code". Mounts
// an xterm.js terminal, spawns `claude login` via the
// ProviderSetupAdapter, and listens for the PTY's Exited event ; on
// exit it re-probes the Claude Code session and emits `(success)` to
// the parent step. The Cancel button closes the PTY and emits
// `(cancel)`.
//
// Inline xterm wiring (rather than reusing TerminalRegistry) because
// the registry is workspace-scoped and the onboarding PTY lives outside
// any workspace's lifecycle.
@Component({
  selector: 'app-feature-claude-login-pty',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full select-text' },
  template: `
    <div class="space-y-4">
      <div class="space-y-1 text-center">
        <h3 class="text-base font-medium">Configure Claude Code</h3>
        <p class="text-xs text-muted-foreground">
          Mozart is running <code class="font-mono">claude login</code> below.
          Follow the prompts in the terminal.
        </p>
      </div>

      <div
        #host
        class="h-72 w-full overflow-hidden rounded-md border bg-sidebar select-text"
      ></div>

      @if (state() === 'detecting') {
        <p class="text-center text-xs text-muted-foreground">
          Detecting Claude Code session…
        </p>
      } @else if (state() === 'failed') {
        <p class="text-center text-xs text-red-600">
          No Claude Code session detected. Try again or use an API key.
        </p>
      }

      <div class="flex items-center justify-between gap-3">
        <button hlmBtn variant="ghost" type="button" (click)="onCancel()">
          Cancel
        </button>
        <button hlmBtn variant="outline" type="button" (click)="onUseApiKey()">
          Use an API key instead
        </button>
      </div>
    </div>
  `,
})
export class FeatureClaudeLoginPty {
  readonly active = input.required<boolean>();
  readonly success = output<void>();
  readonly cancelled = output<void>();
  readonly useApiKey = output<void>();

  private readonly adapter = inject(PROVIDER_SETUP_ADAPTER);
  private readonly profile = inject(ProfileFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly state = signal<
    'idle' | 'connecting' | 'running' | 'detecting' | 'failed' | 'done'
  >('idle');

  private term: Terminal | null = null;
  private fit: FitAddon | null = null;
  private closePty: (() => Promise<void>) | null = null;
  private terminalId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mounted = false;

  constructor() {
    effect(() => {
      if (this.active() && !this.mounted) {
        void this.mount();
      } else if (!this.active() && this.mounted) {
        void this.teardown();
      }
    });
    this.destroyRef.onDestroy(() => void this.teardown());
  }

  protected onCancel(): void {
    void this.teardown();
    this.cancelled.emit();
  }

  protected onUseApiKey(): void {
    void this.teardown();
    this.useApiKey.emit();
  }

  private async mount(): Promise<void> {
    this.mounted = true;
    this.state.set('connecting');

    // Load xterm.js dynamically — keeps the ~290 kB chunk out of the
    // eager shell bundle. The onboarding flow can afford the extra
    // network round-trip on first paint of this sub-step.
    const xtermModules = await loadXterm();
    const term = new xtermModules.xterm.Terminal({
      cols: 80,
      rows: 24,
      cursorBlink: true,
      convertEol: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new xtermModules.fit.FitAddon();
    term.loadAddon(fit);
    term.open(this.host().nativeElement);
    queueMicrotask(() => {
      try {
        fit.fit();
      } catch (err) {
        console.warn('[onboarding] xterm fit failed:', err);
      }
    });

    this.term = term;
    this.fit = fit;

    try {
      const { terminalId, close } = await this.adapter.spawnClaudeLogin(
        term.cols,
        term.rows,
        (event) => {
          if (event.kind === 'output') {
            term.write(event.data);
          } else {
            void this.handleExited();
          }
        },
      );
      this.terminalId = terminalId;
      this.closePty = close;
      this.state.set('running');

      term.onData((data) => {
        if (!this.terminalId) return;
        void this.adapter.write(this.terminalId, data).catch((err) => {
          console.warn('[onboarding] claude-login write failed:', err);
        });
      });
      term.onResize(({ cols, rows }) => {
        if (!this.terminalId) return;
        void this.adapter.resize(this.terminalId, cols, rows).catch((err) => {
          console.warn('[onboarding] claude-login resize failed:', err);
        });
      });

      this.resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* benign — host detached */
        }
      });
      this.resizeObserver.observe(this.host().nativeElement);
    } catch (err) {
      console.error('[onboarding] spawn claude login failed:', err);
      term.write(
        '\r\n\x1b[31mFailed to spawn `claude login`. Use the API-key fallback below.\x1b[0m\r\n',
      );
      this.state.set('failed');
    }
  }

  private async handleExited(): Promise<void> {
    this.state.set('detecting');
    try {
      const outcome = await this.profile.tryConnect();
      if (outcome === 'claude_code') {
        this.state.set('done');
        this.success.emit();
        return;
      }
    } catch (err) {
      console.warn('[onboarding] tryConnect after PTY exit failed:', err);
    }
    this.state.set('failed');
  }

  private async teardown(): Promise<void> {
    if (!this.mounted) return;
    this.mounted = false;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.closePty) {
      try {
        await this.closePty();
      } catch (err) {
        console.warn('[onboarding] close PTY failed:', err);
      }
      this.closePty = null;
    }
    if (this.term) {
      try {
        this.term.dispose();
      } catch (err) {
        console.warn('[onboarding] xterm dispose failed:', err);
      }
      this.term = null;
      this.fit = null;
    }
    this.terminalId = null;
    this.state.set('idle');
  }
}
