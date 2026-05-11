/**
 * `ChatPanelComponent` — center-panel conversation surface for v0.0.1.
 *
 * Responsibilities:
 *   - Render a single accumulated-tokens text view fed by
 *     `BindingsService.startAgentRun(...)`.
 *   - Provide a composer textarea + Send / Stop toggle. Enter sends,
 *     Shift+Enter inserts a newline, ⌘↵ sends + clears.
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
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTextareaImports } from '@mozart/ui/textarea';

import { BindingsService } from '../services/bindings.service';
import { ShortcutService } from '../services/shortcut.service';
import { ShellStore } from '../state/shell.store';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, HlmButtonImports, HlmTextareaImports],
  template: `
    <div class="chat" role="region" aria-label="Workspace conversation">
      <div class="stream">
        @if (isRunning()) {
          <div class="progress-bar" aria-hidden="true"></div>
        }
        <pre class="tokens" aria-live="polite">{{ tokens() }}</pre>
        @if (errorMsg() !== null) {
          <div class="error-banner" role="alert">
            <span class="error-msg">{{ errorMsg() }}</span>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              class="retry-btn"
              type="button"
              (click)="retry()"
            >
              Retry
            </button>
          </div>
        }
      </div>
      <form class="composer" (submit)="onSubmit($event)">
        <textarea
          hlmTextarea
          class="composer-textarea"
          [ngModel]="inputText()"
          (ngModelChange)="inputText.set($event)"
          [disabled]="isRunning()"
          name="prompt"
          placeholder="Type a message…"
          rows="3"
          (keydown)="onKeydown($event)"
        ></textarea>
        <div class="actions">
          @if (isRunning()) {
            <button
              hlmBtn
              variant="destructive"
              size="default"
              type="button"
              class="stop-btn"
              (click)="stop()"
            >
              Stop
            </button>
          } @else {
            <button
              hlmBtn
              variant="default"
              size="default"
              type="submit"
              class="send-btn"
              [disabled]="!inputText().trim()"
            >
              Send
            </button>
          }
        </div>
      </form>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background: var(--bg-center, hsl(var(--background)));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .chat {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .stream {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 16px 24px;
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
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 13px;
      line-height: 1.55;
      color: hsl(var(--foreground));
    }
    .error-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 12px;
      padding: 8px 12px;
      border: 1px solid var(--accent-error-br, hsl(var(--destructive) / 0.4));
      background: var(--accent-error-bg, hsl(var(--destructive) / 0.08));
      border-radius: var(--radius-md, 6px);
      color: var(--status-error, hsl(var(--destructive)));
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 13px;
    }
    .error-msg {
      flex: 1 1 auto;
      overflow-wrap: anywhere;
    }
    /* hlmBtn owns sizing + colors for retry/send/stop; we only allow
       Spartan styles to flow through. */
    .composer {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid hsl(var(--border));
      background: var(--bg-composer, hsl(var(--card)));
    }
    /* hlmTextarea owns border + focus ring; we only constrain sizing. */
    .composer-textarea {
      resize: vertical;
      min-height: 64px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class ChatPanelComponent {
  private readonly bindings = inject(BindingsService);
  private readonly shortcuts = inject(ShortcutService);
  private readonly shellStore = inject(ShellStore);
  private readonly destroyRef = inject(DestroyRef);

  // Public so tests can poke directly. The template binds with
  // `[ngModel]` + `(ngModelChange)` rather than `[(ngModel)]` because
  // the model() signal needs `.set()` on its WritableSignal surface.
  readonly inputText = model('');
  protected readonly tokens = signal('');
  protected readonly isRunning = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly lastPrompt = signal('');
  private stopFn: (() => Promise<void>) | null = null;

  constructor() {
    // ⌘./Ctrl+. = stop, shell-wide.
    this.shortcuts
      .register$({
        key: 'mod+.',
        command: () => undefined,
        preventDefault: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.stop());
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.send(true);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (event.metaKey || event.ctrlKey) {
      // ⌘↵ / Ctrl+↵ → send and clear.
      event.preventDefault();
      void this.send(true);
      return;
    }
    if (event.shiftKey) {
      // Shift+Enter inserts a newline — let the textarea handle it.
      return;
    }
    // Plain Enter → send + clear.
    event.preventDefault();
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
