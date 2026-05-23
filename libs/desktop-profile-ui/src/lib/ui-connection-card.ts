import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleHelp, lucideSparkles } from '@ng-icons/lucide';
import type {
  Connection,
  ConnectionStatus,
} from '@mozart/desktop-profile-util';

type BadgeVariant = 'default' | 'secondary' | 'destructive';

interface StatusView {
  pillVariant: BadgeVariant;
  pillLabel: string;
  // Extra utility classes applied to the badge. Used to render the green
  // "success" look on connected states without adding a new variant to
  // libs/ui/badge (which is read-only).
  pillClass: string;
  showSpinner: boolean;
  showCheck: boolean;
}

// Connected states share the same green-tinted pill so the user has a
// single, consistent "yes, I'm good" signal regardless of which auth
// path is active.
const CONNECTED_PILL_CLASS =
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';

const STATUS_VIEW: Record<ConnectionStatus, StatusView> = {
  unknown: {
    pillVariant: 'secondary',
    pillLabel: '',
    pillClass: '',
    showSpinner: false,
    showCheck: false,
  },
  not_connected: {
    pillVariant: 'secondary',
    pillLabel: 'Not connected',
    pillClass: '',
    showSpinner: false,
    showCheck: false,
  },
  checking: {
    pillVariant: 'secondary',
    pillLabel: 'Checking…',
    pillClass: '',
    showSpinner: true,
    showCheck: false,
  },
  connected: {
    pillVariant: 'default',
    pillLabel: 'Connected',
    pillClass: CONNECTED_PILL_CLASS,
    showSpinner: false,
    showCheck: true,
  },
  connected_via_claude_code: {
    pillVariant: 'default',
    pillLabel: 'Connected · Claude Code',
    pillClass: CONNECTED_PILL_CLASS,
    showSpinner: false,
    showCheck: true,
  },
  invalid: {
    pillVariant: 'destructive',
    pillLabel: 'Key invalid',
    pillClass: '',
    showSpinner: false,
    showCheck: false,
  },
  network_error: {
    pillVariant: 'destructive',
    pillLabel: "Can't reach Anthropic",
    pillClass: '',
    showSpinner: false,
    showCheck: false,
  },
};

// Presentational. Inputs in, events out. No injection, no Tauri, no
// facade.
@Component({
  selector: 'app-ui-connection-card',
  imports: [
    HlmButtonImports,
    HlmBadgeImports,
    HlmSpinnerImports,
    HlmIconImports,
    HlmTooltipImports,
    NgIcon,
  ],
  providers: [provideIcons({ lucideCheck, lucideCircleHelp, lucideSparkles })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="rounded-md border border-border/60 bg-muted/30 p-4 space-y-3">
      <div class="flex items-start gap-3">
        <ng-icon
          hlm
          name="lucideSparkles"
          size="lg"
          class="mt-0.5 shrink-0 text-foreground/80"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center gap-1.5">
            <h3 class="text-sm font-medium">Anthropic</h3>
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              hlmTooltip="How Mozart connects to Anthropic"
              position="top"
              class="size-6 rounded-md text-muted-foreground"
              (click)="help.emit()"
              aria-label="How Mozart connects to Anthropic"
            >
              <ng-icon hlm name="lucideCircleHelp" size="xs" />
            </button>
          </div>
          <p class="text-xs text-muted-foreground">
            API key or Claude Code login
          </p>
        </div>
        @if (view().pillLabel) {
          <span
            hlmBadge
            [variant]="view().pillVariant"
            [class]="view().pillClass"
          >
            @if (view().showSpinner) {
              <hlm-spinner aria-label="Checking" />
            }
            @if (view().showCheck) {
              <ng-icon hlm name="lucideCheck" size="xs" />
            }
            {{ view().pillLabel }}
          </span>
        }
      </div>
      @if (showActions()) {
        <div class="flex justify-end gap-2">
          @switch (connection().status) {
            @case ('not_connected') {
              <button hlmBtn size="sm" type="button" (click)="connect.emit()">
                Connect
              </button>
            }
            @case ('connected') {
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                (click)="testConnection.emit()"
              >
                Test connection
              </button>
              <button
                hlmBtn
                variant="outline"
                size="sm"
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
                size="sm"
                type="button"
                (click)="useApiKey.emit()"
              >
                Use API key instead
              </button>
            }
            @case ('invalid') {
              <button hlmBtn size="sm" type="button" (click)="connect.emit()">
                Reconnect
              </button>
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                (click)="disconnect.emit()"
              >
                Disconnect
              </button>
            }
            @case ('network_error') {
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="testConnection.emit()"
              >
                Retry
              </button>
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                (click)="disconnect.emit()"
              >
                Disconnect
              </button>
            }
          }
        </div>
      }
    </div>
  `,
})
export class UiConnectionCard {
  readonly connection = input.required<Connection>();

  readonly connect = output<void>();
  readonly disconnect = output<void>();
  readonly testConnection = output<void>();
  readonly useApiKey = output<void>();
  readonly help = output<void>();

  protected readonly view = computed<StatusView>(
    () => STATUS_VIEW[this.connection().status],
  );

  // Actions row hides when there are no buttons to render — keeps the
  // card compact while connection state hasn't resolved yet.
  protected readonly showActions = computed(() => {
    const status = this.connection().status;
    return status !== 'unknown' && status !== 'checking';
  });
}
