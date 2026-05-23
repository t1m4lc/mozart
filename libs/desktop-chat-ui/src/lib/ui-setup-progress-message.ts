import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import type { Message } from '@mozart/desktop-chat-util';

/**
 * Mutable chat-timeline entry that tracks the bootstrap setup lifecycle.
 *
 * Visual states (text mirrors the pre-P0.3 conversational tone):
 *   running → spinner + "Installing dependencies with pnpm…"
 *   done    → ✓        + "Installed dependencies with pnpm."
 *   failed  → ✕        + "Couldn't install dependencies with pnpm." + error
 *
 * When the manager name isn't known, copy falls back to the bare command
 * ("Installing dependencies (pnpm install)…").
 *
 * Renders nothing when the underlying `setupProgress` payload is missing.
 */
@Component({
  selector: 'app-setup-progress-message',
  imports: [HlmSpinnerImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = _progress();
    @if (p) {
      <div
        role="status"
        aria-live="polite"
        class="bg-muted/40 border-border/60 text-muted-foreground rounded-md border px-3 py-2 text-sm"
      >
        <div class="flex items-start gap-2">
          @switch (p.status) {
            @case ('running') {
              <hlm-spinner
                aria-label="Setup running"
                class="mt-0.5 shrink-0 text-muted-foreground"
              />
            }
            @case ('done') {
              <span
                class="text-foreground mt-0.5 select-none"
                aria-hidden="true"
                >✓</span
              >
            }
            @case ('failed') {
              <span
                class="text-foreground mt-0.5 select-none"
                aria-hidden="true"
                >✕</span
              >
            }
          }
          <div class="flex-1 space-y-1">
            <p class="text-foreground">{{ _label() }}</p>
            @if (p.status === 'failed' && p.errorMessage) {
              <p class="text-destructive text-xs">{{ p.errorMessage }}</p>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SetupProgressMessage {
  readonly message = input.required<Message>();
  protected readonly _progress = computed(() => this.message().setupProgress);
  protected readonly _label = computed(() => {
    const p = this._progress();
    if (!p) return '';
    const tail = p.manager
      ? `dependencies with ${p.manager}`
      : `dependencies (${p.command})`;
    switch (p.status) {
      case 'done':
        return `Installed ${tail}.`;
      case 'failed':
        return `Couldn't install ${tail}.`;
      case 'running':
      default:
        return `Installing ${tail}…`;
    }
  });
}
