import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { loadXterm } from '@mozart/desktop-core-util';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { PROVIDER_SETUP_ADAPTER } from '@mozart/desktop-onboarding-data-access';

// Sub-step opened when the user clicks "Configure" for a provider. Mounts
// an xterm.js terminal, spawns `<provider> login` via the
// ProviderSetupAdapter, and listens for the PTY's Exited event ; on
// exit it re-probes the provider's session and emits `(success)` to
// the parent step. The Cancel button closes the PTY and emits
// `(cancel)`. Handles both Claude Code and Codex via the `provider` input.
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
        <h3 class="text-base font-medium">Configure {{ label() }}</h3>
        <p class="text-xs text-muted-foreground">
          Mozart is running <code class="font-mono">{{ loginCmd() }}</code> below.
          Follow the prompts in the terminal.
        </p>
      </div>

      <div
        #host
        class="h-72 w-full overflow-hidden rounded-md border bg-sidebar select-text"
      ></div>

      @if (state() === 'detecting') {
        <p class="text-center text-xs text-muted-foreground">
          Detecting {{ label() }} session…
        </p>
      } @else if (state() === 'failed') {
        <p class="text-center text-xs text-destructive">
          No {{ label() }} session detected. Try again or use an API key.
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
  /** Which provider's login flow to run. Defaults to Claude so existing
   *  callers are unaffected. */
  readonly provider = input<'claude' | 'codex'>('claude');
  readonly success = output<void>();
  readonly cancelled = output<void>();
  readonly useApiKey = output<void>();

  private readonly adapter = inject(PROVIDER_SETUP_ADAPTER);
  private readonly profile = inject(ProfileFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host =
    viewChild.required<ElementRef<HTMLDivElement>>('host');

  protected readonly label = computed(() =>
    this.provider() === 'codex' ? 'Codex' : 'Claude Code',
  );
  protected readonly loginCmd = computed(() =>
    this.provider() === 'codex' ? 'codex login' : 'claude login',
  );

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
      const spawn =
        this.provider() === 'codex'
          ? this.adapter.spawnCodexLogin.bind(this.adapter)
          : this.adapter.spawnClaudeLogin.bind(this.adapter);
      const { terminalId, close } = await spawn(
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
      console.error('[onboarding] spawn login failed:', err);
      term.write(
        `\r\n\x1b[31mFailed to spawn \`${this.loginCmd()}\`. Use the API-key fallback below.\x1b[0m\r\n`,
      );
      this.state.set('failed');
    }
  }

  private async handleExited(): Promise<void> {
    this.state.set('detecting');
    try {
      if (this.provider() === 'codex') {
        const outcome = await this.profile.tryConnectCodex();
        if (outcome === 'codex_session') {
          this.state.set('done');
          this.success.emit();
          return;
        }
      } else {
        const outcome = await this.profile.tryConnect();
        if (outcome === 'claude_code') {
          this.state.set('done');
          this.success.emit();
          return;
        }
      }
    } catch (err) {
      console.warn('[onboarding] re-probe after PTY exit failed:', err);
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
