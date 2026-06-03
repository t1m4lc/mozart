import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  PROVIDER_REGISTRY,
  type ConnectionProviderId,
} from '@mozart/desktop-llm-model-util';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import type { ConnectionStatus } from '@mozart/desktop-profile-util';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCloud,
  lucideCpu,
  lucideHardDrive,
  lucideInfo,
  lucideLock,
  lucideRefreshCw,
  lucideSparkles,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { FeatureClaudeLoginPty } from './feature-claude-login-pty';

const STATUS_DOT_CLASS: Record<'idle' | 'ok' | 'busy' | 'fail', string> = {
  idle: 'bg-muted',
  ok: 'bg-green-500',
  busy: 'bg-brand/60 animate-pulse',
  fail: 'bg-destructive',
};

/** Bucket the raw connection statuses into the four UI states the status
 *  dot understands. Shared across provider cards. */
function bucketStatus(
  status: ConnectionStatus,
): 'idle' | 'ok' | 'busy' | 'fail' {
  switch (status) {
    case 'connected':
    case 'connected_via_claude_code':
    case 'connected_via_codex':
      return 'ok';
    case 'checking':
      return 'busy';
    case 'invalid':
    case 'network_error':
      return 'fail';
    default:
      return 'idle';
  }
}

/** Per-provider status detail copy for the `ok`/`fail` rows. */
function detailFor(
  status: ConnectionStatus,
  provider: ConnectionProviderId,
): string {
  switch (status) {
    case 'connected':
      return 'Using your API key.';
    case 'connected_via_claude_code':
      return 'Detected your existing claude login session.';
    case 'connected_via_codex':
      return 'Detected your existing codex login session.';
    case 'invalid':
      return 'Your stored credentials were rejected.';
    case 'network_error':
      return provider === 'codex'
        ? "Couldn't reach OpenAI — check your connection."
        : "Couldn't reach Anthropic — check your connection.";
    default:
      return '';
  }
}

// Step 3 of the onboarding wizard — multi-provider setup. Each provider in
// PROVIDER_REGISTRY renders as a card the user can connect independently
// (Claude Code and/or Codex; Local & Mozart Cloud show "Coming soon"). The
// step is soft-required: the shell's Continue button stays disabled until at
// least one provider is connected (`providerReady`), but there is no skip —
// Mozart needs a usable agent backend to do anything.
@Component({
  selector: 'app-feature-onboarding-step-provider',
  imports: [HlmButtonImports, HlmIconImports, NgIcon, FeatureClaudeLoginPty],
  providers: [
    provideIcons({
      lucideLock,
      lucideRefreshCw,
      lucideInfo,
      lucideSparkles,
      lucideCpu,
      lucideHardDrive,
      lucideCloud,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (configuring(); as cp) {
      <app-feature-claude-login-pty
        [active]="true"
        [provider]="cp"
        (success)="onPtyDone()"
        (cancelled)="onPtyDone()"
        (useApiKey)="onUseApiKey()"
      />
    } @else {
      <div class="space-y-5">
        <div class="mx-auto max-w-md space-y-1.5 text-center">
          <h2 class="text-xl font-semibold tracking-tight">
            Connect your AI provider
          </h2>
          <p class="text-muted-foreground text-sm">
            Connect Claude Code or Codex. At least one is required to continue.
          </p>
        </div>

        <div class="space-y-2">
          @for (c of cards(); track c.id) {
            <div
              class="bg-muted/30 flex items-center gap-3 rounded-md border border-border/60 px-4 py-3"
              [class.opacity-60]="c.availability === 'coming_soon'"
            >
              @if (c.availability === 'available') {
                <span
                  [class]="
                    'inline-block size-2 shrink-0 rounded-full ' +
                    dotClass(c.kind)
                  "
                  aria-hidden="true"
                ></span>
              } @else {
                <ng-icon
                  hlm
                  [name]="c.iconName"
                  size="sm"
                  class="text-muted-foreground shrink-0"
                />
              }

              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">{{ c.label }}</p>
                @if (c.availability === 'available') {
                  <p class="text-muted-foreground truncate text-xs">
                    @switch (c.kind) {
                      @case ('ok') {
                        {{ c.detail }}
                      }
                      @case ('busy') {
                        Checking…
                      }
                      @case ('fail') {
                        {{ c.detail }}
                      }
                      @default {
                        Not configured yet
                      }
                    }
                  </p>
                } @else {
                  <p class="text-muted-foreground text-xs">Coming soon</p>
                }
              </div>

              @if (
                c.availability === 'available' && c.connectionProvider;
                as cp
              ) {
                @switch (c.kind) {
                  @case ('ok') {
                    <span class="text-xs font-medium text-green-600"
                      >Connected</span
                    >
                  }
                  @case ('fail') {
                    <button
                      hlmBtn
                      size="sm"
                      variant="outline"
                      type="button"
                      (click)="onConfigure(cp)"
                    >
                      <ng-icon hlm name="lucideRefreshCw" size="xs" />
                      Retry
                    </button>
                  }
                  @case ('busy') {
                    <!-- probe in flight; no action -->
                  }
                  @default {
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      (click)="onConfigure(cp)"
                    >
                      Connect
                    </button>
                  }
                }
              }
            </div>
          }
        </div>

        <p
          class="text-muted-foreground flex items-center justify-start gap-2 text-xs"
        >
          <ng-icon hlm name="lucideLock" size="xs" />
          <span>
            Keys are stored in your OS keychain — never synced to our servers,
            never logged.
          </span>
        </p>

        @if (providerReady()) {
          <p
            class="text-muted-foreground flex items-center justify-start gap-2 text-xs"
          >
            <ng-icon hlm name="lucideInfo" size="xs" />
            <span>You can connect more providers later from Settings.</span>
          </p>
        }
      </div>
    }
  `,
})
export class FeatureOnboardingStepProvider {
  protected readonly facade = inject(OnboardingFacade);
  protected readonly profile = inject(ProfileFacade);
  private readonly dialog = inject(HlmDialogService);

  // The provider whose login PTY is currently open, or null.
  protected readonly configuring = signal<ConnectionProviderId | null>(null);

  // Registry rows enriched with live connection status (reactive).
  protected readonly cards = computed(() =>
    PROVIDER_REGISTRY.map((d) => {
      const cp = d.connectionProvider;
      const status: ConnectionStatus = cp
        ? this.profile.connectionFor(cp)()
        : 'unknown';
      return {
        ...d,
        kind: bucketStatus(status),
        detail: cp ? detailFor(status, cp) : '',
      };
    }),
  );

  protected readonly providerReady = computed(() =>
    this.profile.hasAnyProvider(),
  );

  constructor() {
    void this.profile.initialize();
    void this.profile.initializeCodex();
    effect(() => {
      this.facade.markStep(
        'provider',
        this.providerReady() ? 'done' : 'pending',
      );
    });
  }

  protected dotClass(kind: 'idle' | 'ok' | 'busy' | 'fail'): string {
    return STATUS_DOT_CLASS[kind];
  }

  protected async onConfigure(cp: ConnectionProviderId): Promise<void> {
    if (cp === 'codex') {
      const outcome = await this.profile.tryConnectCodex();
      if (outcome === 'codex_session') return;
    } else {
      const outcome = await this.profile.tryConnect();
      if (outcome === 'claude_code') return;
    }
    this.configuring.set(cp);
  }

  protected onPtyDone(): void {
    this.configuring.set(null);
  }

  protected async onUseApiKey(): Promise<void> {
    const cp = this.configuring();
    this.configuring.set(null);
    if (cp === 'codex') {
      const { UiCodexConnectDialog } = await import(
        '@mozart/desktop-profile-feature'
      );
      this.dialog.open(UiCodexConnectDialog, {});
      return;
    }
    const { UiConnectDialog } = await import('@mozart/desktop-profile-feature');
    this.dialog.open(UiConnectDialog, {});
  }
}
