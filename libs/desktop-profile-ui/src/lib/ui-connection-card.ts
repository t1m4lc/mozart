import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleHelp } from '@ng-icons/lucide';
import type {
  Connection,
  ConnectionProvider,
  ConnectionStatus,
} from '@mozart/desktop-profile-util';

// Per-provider connection copy. The provider *name* is NOT here — it comes
// from the registry via the `label` input (single source of truth). These are
// connection-specific strings (login wording, unreachable host, hint).
const PROVIDER_COPY: Record<
  ConnectionProvider,
  {
    loginName: string;
    unreachable: string;
    notConnected: string;
  }
> = {
  claude: {
    loginName: 'Claude Code',
    unreachable: "Can't reach Anthropic",
    notConnected: 'API key or Claude Code login',
  },
  codex: {
    loginName: 'Codex',
    unreachable: "Can't reach OpenAI",
    notConnected: 'API key or Codex login',
  },
};

// Status-dot palette mirrors the onboarding step (provider/git) so the
// /settings card reads as the same affordance the user just saw during
// onboarding.
const STATUS_DOT_CLASS: Record<ConnectionStatus, string> = {
  unknown: 'bg-muted',
  not_connected: 'bg-muted',
  checking: 'bg-brand/60 animate-pulse',
  connected: 'bg-green-500',
  connected_via_claude_code: 'bg-green-500',
  connected_via_codex: 'bg-green-500',
  invalid: 'bg-destructive',
  network_error: 'bg-destructive',
};

// Presentational. Inputs in, events out. No injection, no Tauri, no
// facade.
@Component({
  selector: 'app-ui-connection-card',
  imports: [HlmButtonImports, HlmIconImports, HlmTooltipImports, NgIcon],
  providers: [provideIcons({ lucideCircleHelp })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-4 py-3"
    >
      <span
        [class]="'inline-block size-2 shrink-0 rounded-full ' + statusDot()"
        aria-hidden="true"
      ></span>
      <div class="min-w-0 flex-1 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="font-medium">{{ label() }}</span>
          <button
            hlmBtn
            variant="ghost"
            size="icon-xs"
            type="button"
            [hlmTooltip]="helpText()"
            position="top"
            class="size-6 rounded-md text-muted-foreground"
            (click)="help.emit()"
            [attr.aria-label]="helpText()"
          >
            <ng-icon hlm name="lucideCircleHelp" size="xs" />
          </button>
        </div>
        <p class="truncate text-xs text-muted-foreground">{{ detail() }}</p>
      </div>
      @switch (connection().status) {
        @case ('not_connected') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="connect.emit()"
          >
            Connect
          </button>
        }
        @case ('connected') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="testConnection.emit()"
          >
            Test connection
          </button>
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="disconnect.emit()"
          >
            Disconnect
          </button>
        }
        @case ('connected_via_claude_code') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="useApiKey.emit()"
          >
            Use API key instead
          </button>
        }
        @case ('connected_via_codex') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="useApiKey.emit()"
          >
            Use API key instead
          </button>
        }
        @case ('invalid') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="connect.emit()"
          >
            Reconnect
          </button>
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="disconnect.emit()"
          >
            Disconnect
          </button>
        }
        @case ('network_error') {
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="testConnection.emit()"
          >
            Retry
          </button>
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="disconnect.emit()"
          >
            Disconnect
          </button>
        }
      }
    </div>
  `,
})
export class UiConnectionCard {
  readonly connection = input.required<Connection>();
  /** Which provider this card represents. Defaults to `'claude'`. */
  readonly connectionProvider = input<ConnectionProvider>('claude');
  /** Provider display name, supplied from PROVIDER_REGISTRY (single source of
   *  truth). Defaults to the connection track's title-cased id as a fallback. */
  readonly label = input<string>('');

  readonly connect = output<void>();
  readonly disconnect = output<void>();
  readonly testConnection = output<void>();
  readonly useApiKey = output<void>();
  readonly help = output<void>();

  protected readonly copy = computed(
    () => PROVIDER_COPY[this.connectionProvider()],
  );

  protected readonly helpText = computed(
    () => `How Mozart connects to ${this.label()}`,
  );

  protected readonly statusDot = computed(
    () => STATUS_DOT_CLASS[this.connection().status],
  );

  protected readonly detail = computed(() => {
    const c = this.copy();
    switch (this.connection().status) {
      case 'connected':
        return 'Using your API key';
      case 'connected_via_claude_code':
      case 'connected_via_codex':
        return `Using your ${c.loginName} login`;
      case 'checking':
        return 'Checking…';
      case 'invalid':
        return 'Stored key was rejected';
      case 'network_error':
        return c.unreachable;
      case 'not_connected':
        return c.notConnected;
      default:
        return '';
    }
  });
}
