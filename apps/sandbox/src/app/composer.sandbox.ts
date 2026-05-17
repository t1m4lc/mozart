import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  HlmComposerImports,
  type ChatMode,
  type ComposerSendEvent,
} from '@mozart-ui/composer';

interface SandboxLogEntry {
  readonly t: number;
  readonly kind: 'send' | 'stop';
  readonly text?: string;
  readonly mode?: ChatMode;
}

@Component({
  selector: 'app-composer-sandbox',
  imports: [RouterLink, HlmButtonImports, HlmComposerImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full' },
  template: `
    <section class="flex flex-col gap-4 max-w-3xl mx-auto p-6 h-full">
      <header class="flex items-center justify-between">
        <h1 class="text-lg font-semibold">HlmComposer sandbox</h1>
        <a hlmBtn variant="ghost" size="sm" routerLink="/"> ← Back </a>
      </header>

      <div class="flex items-center gap-2 text-sm">
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="_toggleRunning()"
        >
          isRunning : {{ isRunning() ? 'on' : 'off' }}
        </button>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="_toggleDisabled()"
        >
          disabled : {{ disabled() ? 'on' : 'off' }}
        </button>
        <span class="text-muted-foreground">
          mode : <strong>{{ mode() }}</strong>
        </span>
        <span class="text-muted-foreground">
          value : <strong>"{{ value() }}"</strong>
        </span>
      </div>

      <div class="border border-border rounded-md overflow-hidden">
        <mz-composer
          [(value)]="value"
          [(mode)]="mode"
          [isRunning]="isRunning()"
          [disabled]="disabled()"
          placeholder="Type a message…"
          (send)="_onSend($event)"
          (stop)="_onStop()"
        />
      </div>

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-muted-foreground">
          Emitted events
        </h2>
        @if (log().length === 0) {
          <p class="text-sm text-muted-foreground italic">
            No event yet. Press Enter / ⌘↵ / click Send.
          </p>
        } @else {
          <ul class="flex flex-col gap-1 font-mono text-xs">
            @for (entry of log(); track entry.t) {
              <li>
                <span class="text-muted-foreground">{{ entry.t }}</span>
                @if (entry.kind === 'send') {
                  →
                  <strong class="text-primary">send</strong>
                  <span>mode={{ entry.mode }}</span>
                  <span>text="{{ entry.text }}"</span>
                } @else {
                  →
                  <strong class="text-destructive">stop</strong>
                }
              </li>
            }
          </ul>
        }
      </section>
    </section>
  `,
})
export class ComposerSandbox {
  protected readonly value = signal('');
  protected readonly mode = signal<ChatMode>('agent');
  protected readonly isRunning = signal(false);
  protected readonly disabled = signal(false);
  protected readonly log = signal<readonly SandboxLogEntry[]>([]);

  protected _toggleRunning(): void {
    this.isRunning.update((v) => !v);
  }

  protected _toggleDisabled(): void {
    this.disabled.update((v) => !v);
  }

  protected _onSend(event: ComposerSendEvent): void {
    this._append({
      t: Date.now(),
      kind: 'send',
      text: event.text,
      mode: event.mode,
    });
  }

  protected _onStop(): void {
    this._append({ t: Date.now(), kind: 'stop' });
  }

  private _append(entry: SandboxLogEntry): void {
    this.log.update((current) => [entry, ...current].slice(0, 20));
  }
}
