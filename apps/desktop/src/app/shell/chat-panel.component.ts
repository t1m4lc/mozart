/**
 * `ChatPanelComponent` — center-panel conversation surface for v0.0.1.
 *
 * Responsibilities:
 *   - Render a single accumulated-tokens text view fed by
 *     `BindingsService.startAgentRun(...)`.
 *   - Host `<app-composer>` for the message input. The composer owns
 *     the textarea, the disabled "coming-soon" toolbar (model, effort,
 *     mode, attachments, links, issues), the `⌘⏎` hint and the
 *     Send/Stop pair. We just wire its `submit` / `stop` outputs into
 *     the streaming pipeline.
 *   - Render an inline error banner with `[Retry]` on
 *     `StreamEvent::Error`.
 *   - Bind ⌘. / Ctrl+. globally to stop the running agent.
 *
 * Out of scope (deferred per audit-plan.md):
 *   - Message bubbles / role separation (no parser yet).
 *   - Tabs per workspace (F2).
 *   - Token counter / context indicator.
 *   - Model picker / effort / @ / attachments (plans 10/11).
 */
import { ChangeDetectionStrategy, Component, DestroyRef, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmButtonImports } from '@mozart/ui/button';

import { BindingsService } from '../services/bindings.service';
import { ShellStore } from '../state/shell.store';
import { ComposerComponent } from './composer.component';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, ComposerComponent],
  host: { class: 'block w-full h-full text-foreground' },
  template: `
    <div
      class="flex flex-col h-full min-h-0"
      role="region"
      aria-label="Workspace conversation"
    >
      <div class="flex-auto min-h-0 overflow-y-auto py-4 px-6">
        @if (isRunning()) {
          <div class="progress-bar" aria-hidden="true"></div>
        }
        <pre
          class="tokens m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-foreground"
          aria-live="polite"
        >{{ tokens() }}</pre>
        @if (errorMsg() !== null) {
          <div
            class="error-banner flex items-center justify-between gap-3 mt-3 py-2 px-3 rounded-md text-[13px]"
            role="alert"
          >
            <span class="flex-auto [overflow-wrap:anywhere]">{{ errorMsg() }}</span>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              class="retry-btn"
              (click)="retry()"
            >
              Retry
            </button>
          </div>
        }
      </div>
      <app-composer
        [isRunning]="isRunning()"
        [(value)]="inputText"
        (send)="onComposerSubmit()"
        (stop)="stop()"
      />
    </div>
  `,
  styles: `
    :host {
      background: var(--bg-center, hsl(var(--background)));
      font-family: var(--font-sans);
    }
    .progress-bar {
      position: sticky;
      top: 0;
      height: 2px;
      width: 100%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--status-running) 50%,
        transparent 100%
      );
      background-size: 200% 100%;
      animation: progress-slide 1.2s linear infinite;
      z-index: 1;
    }
    @keyframes progress-slide {
      0%   { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    .tokens {
      font-family: var(--font-mono, ui-monospace, monospace);
    }
    .error-banner {
      border: 1px solid var(--accent-error-br, hsl(var(--destructive) / 0.4));
      background: var(--accent-error-bg, hsl(var(--destructive) / 0.08));
      color: var(--status-error, hsl(var(--destructive)));
      font-family: var(--font-mono, ui-monospace, monospace);
    }
  `,
})
export class ChatPanelComponent {
  private readonly bindings = inject(BindingsService);
  private readonly shellStore = inject(ShellStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly inputText = model('');
  protected readonly tokens = signal('');
  protected readonly isRunning = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly lastPrompt = signal('');
  private stopFn: (() => Promise<void>) | null = null;

  /** Composer `(send)` output → forward to the streaming pipeline.
   *  `inputText` is already in sync with the composer via two-way binding,
   *  so `send()` can read the prompt from there as before. The emitted
   *  string is intentionally ignored. */
  protected onComposerSubmit(): void {
    void this.send(true);
  }

  async send(clearAfter = false): Promise<void> {
    const prompt = this.inputText().trim();
    if (!prompt || this.isRunning()) return;
    const workspaceId = this.shellStore.activeWorkspaceId();
    if (!workspaceId) return;

    this.lastPrompt.set(prompt);
    this.errorMsg.set(null);
    this.tokens.update((t) => t + `\n\n> ${prompt}\n\n`);
    if (clearAfter) this.inputText.set('');
    this.isRunning.set(true);

    const { events$, stop } = this.bindings.startAgentRun(workspaceId, prompt);
    this.stopFn = stop;
    events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ev) => {
        if (ev.kind === 'stream_token') {
          this.tokens.update((t) => t + ev.text);
        } else if (ev.kind === 'error') {
          this.errorMsg.set(ev.message);
        } else if (ev.kind === 'cli_output') {
          this.tokens.update((t) => t + ev.line + '\n');
        }
      },
      complete: () => {
        this.isRunning.set(false);
        this.stopFn = null;
      },
      error: (err: unknown) => {
        this.isRunning.set(false);
        this.errorMsg.set(err instanceof Error ? err.message : String(err));
        this.stopFn = null;
      },
    });
  }

  async stop(): Promise<void> {
    const fn = this.stopFn;
    if (!fn) return;
    try {
      await fn();
    } catch (err) {
      this.errorMsg.set(err instanceof Error ? err.message : String(err));
    }
  }

  retry(): void {
    const last = this.lastPrompt();
    if (!last || this.isRunning()) return;
    this.errorMsg.set(null);
    this.inputText.set(last);
    void this.send(true);
  }
}
