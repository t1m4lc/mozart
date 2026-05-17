import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSelectImports } from '@mozart/ui/select';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInfo, lucideLock, lucideRefreshCw } from '@ng-icons/lucide';
import { ProfileFacade } from '../profile';
import { OnboardingFacade } from './data/onboarding.facade';
import { FeatureClaudeLoginPty } from './feature-claude-login-pty';

type ProviderId = 'claude' | 'openai' | 'openrouter' | 'local';

interface ProviderEntry {
  readonly id: ProviderId;
  readonly name: string;
  readonly hint: string;
  readonly enabled: boolean;
}

const PROVIDERS: readonly ProviderEntry[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    hint: 'Sonnet 4.6 · Opus 4.7',
    enabled: true,
  },
  { id: 'openai', name: 'OpenAI', hint: 'gpt-4o · gpt-4.1', enabled: false },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    hint: 'Multi-model gateway',
    enabled: false,
  },
  {
    id: 'local',
    name: 'Local (Ollama)',
    hint: 'Run models on your machine',
    enabled: false,
  },
] as const;

const STATUS_DOT_CLASS: Record<'idle' | 'ok' | 'busy' | 'fail', string> = {
  idle: 'bg-muted',
  ok: 'bg-green-500',
  busy: 'bg-brand/60 animate-pulse',
  fail: 'bg-destructive',
};

// Step 3 of the onboarding wizard. Single-provider select drives an
// inline configuration section ; the disclosure note + status dot live
// underneath. Mozart auto-probes Claude on mount so a returning user
// (existing `claude login` session or stored API key) lands on the
// configured state without an extra click.
@Component({
  selector: 'app-feature-onboarding-step-provider',
  imports: [
    HlmButtonImports,
    HlmIconImports,
    HlmSelectImports,
    NgIcon,
    FeatureClaudeLoginPty,
  ],
  providers: [provideIcons({ lucideLock, lucideRefreshCw, lucideInfo })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (showPty()) {
      <!-- Render synchronously — @defer added latency between Configure
           click and the PTY appearing, which felt broken. xterm now
           lands in the main bundle; acceptable given the onboarding
           path is the entry point. -->
      <app-feature-claude-login-pty
        [active]="showPty()"
        (success)="onPtySuccess()"
        (cancelled)="onPtyCancel()"
        (useApiKey)="onUseApiKey()"
      />
    } @else {
      <div class="space-y-6">
        <div class="mx-auto max-w-md space-y-2 text-center">
          <h2 class="text-xl font-semibold tracking-tight">
            Connect LLM provider
          </h2>
          <p class="text-muted-foreground text-sm">
            Pick one to start — you can add more later.
          </p>
        </div>

        <div class="space-y-3">
          <p
            class="text-muted-foreground text-xs font-medium"
            id="provider-label"
          >
            Provider
          </p>
          <hlm-select
            aria-labelledby="provider-label"
            [value]="selectedProvider()"
            (valueChange)="onProviderChange($event)"
          >
            <hlm-select-trigger class="w-full">
              <hlm-select-value placeholder="Choose a provider" />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              @for (p of providers; track p.id) {
                <hlm-select-item [value]="p.id" [disabled]="!p.enabled">
                  <div class="flex w-full items-center justify-between gap-3">
                    <span class="font-medium">{{ p.name }}</span>
                    <span class="text-muted-foreground text-xs">
                      @if (p.enabled) {
                        {{ p.hint }}
                      } @else {
                        Coming soon
                      }
                    </span>
                  </div>
                </hlm-select-item>
              }
            </hlm-select-content>
          </hlm-select>
        </div>

        <!-- Status + actions for the selected provider -->
        @if (selectedProvider() === 'claude') {
          <div
            class="bg-muted/30 flex items-center gap-3 rounded-md border border-border/60 px-4 py-3"
            role="status"
          >
            <span
              [class]="
                'inline-block size-2 shrink-0 rounded-full ' + statusDot()
              "
              aria-hidden="true"
            ></span>
            <div class="flex-1 text-sm">
              @switch (statusKind()) {
                @case ('ok') {
                  <span class="font-medium">Claude Code is connected.</span>
                  <span class="text-muted-foreground ml-2 text-xs">
                    {{ statusDetail() }}
                  </span>
                }
                @case ('busy') {
                  <span>Checking your Claude Code setup…</span>
                }
                @case ('fail') {
                  <span class="font-medium">{{ statusDetail() }}</span>
                }
                @default {
                  <span>Claude Code isn't configured yet.</span>
                }
              }
            </div>

            @if (statusKind() === 'fail') {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="onConfigureClaude()"
              >
                <ng-icon hlm name="lucideRefreshCw" size="xs" />
                Retry
              </button>
            } @else if (statusKind() === 'idle') {
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="onConfigureClaude()"
              >
                Configure
              </button>
            }
            <!-- 'ok' state shows the green dot only — Reconfigure
                 lives in Settings post-onboarding. 'busy' shows the
                 pulse dot + "Checking…" with no action. -->
          </div>
        }

        <!-- Compact key-storage disclosure -->
        <p
          class="text-muted-foreground flex items-start justify-center gap-2 text-xs"
        >
          <ng-icon hlm name="lucideLock" size="xs" class="mt-0.5 shrink-0" />
          <span>
            Keys are stored in your OS keychain — never synced to our servers,
            never logged.
          </span>
        </p>

        @if (statusKind() === 'ok') {
          <p
            class="text-muted-foreground flex items-center justify-start gap-2 text-xs"
          >
            <ng-icon hlm name="lucideInfo" size="xs" class="" />
            <span>You can connect more providers later from Settings. </span>
          </p>
        }

        <div class="flex items-center justify-between gap-3">
          <button hlmBtn variant="ghost" type="button" (click)="facade.back()">
            Back
          </button>
          <button
            hlmBtn
            type="button"
            [disabled]="!providerReady()"
            (click)="onContinue()"
          >
            Continue
          </button>
        </div>
      </div>
    }
  `,
})
export class FeatureOnboardingStepProvider {
  protected readonly facade = inject(OnboardingFacade);
  protected readonly profile = inject(ProfileFacade);
  private readonly dialog = inject(HlmDialogService);

  protected readonly providers = PROVIDERS;
  protected readonly selectedProvider = signal<ProviderId>('claude');
  protected readonly showPty = signal<boolean>(false);

  protected readonly providerReady = computed(() => {
    const status = this.profile.connection().status;
    return status === 'connected' || status === 'connected_via_claude_code';
  });

  /** Bucket the seven raw connection statuses into the four UI states
   *  the status dot understands. */
  protected readonly statusKind = computed<'idle' | 'ok' | 'busy' | 'fail'>(
    () => {
      switch (this.profile.connection().status) {
        case 'connected':
        case 'connected_via_claude_code':
          return 'ok';
        case 'checking':
          return 'busy';
        case 'invalid':
        case 'network_error':
          return 'fail';
        default:
          return 'idle';
      }
    },
  );
  protected readonly statusDot = computed(
    () => STATUS_DOT_CLASS[this.statusKind()],
  );
  protected readonly statusDetail = computed(() => {
    switch (this.profile.connection().status) {
      case 'connected':
        return 'Using your API key.';
      case 'connected_via_claude_code':
        return 'Detected your existing claude login session.';
      case 'invalid':
        return 'Your stored credentials were rejected.';
      case 'network_error':
        return "Couldn't reach Anthropic — check your connection.";
      default:
        return '';
    }
  });

  constructor() {
    void this.profile.initialize();
    effect(() => {
      this.facade.markStep(
        'provider',
        this.providerReady() ? 'done' : 'pending',
      );
    });
  }

  @HostListener('document:keyup.enter')
  protected onEnterKey(): void {
    if (!this.showPty() && this.providerReady()) this.onContinue();
  }

  protected onContinue(): void {
    this.facade.advance();
  }

  protected onProviderChange(value: ProviderId | null): void {
    if (value) this.selectedProvider.set(value);
  }

  protected async onConfigureClaude(): Promise<void> {
    const outcome = await this.profile.tryConnect();
    if (outcome === 'claude_code') return;
    this.showPty.set(true);
  }

  protected onPtySuccess(): void {
    this.showPty.set(false);
  }

  protected onPtyCancel(): void {
    this.showPty.set(false);
  }

  protected async onUseApiKey(): Promise<void> {
    this.showPty.set(false);
    const { UiConnectDialog } = await import('../profile/ui-connect-dialog');
    this.dialog.open(UiConnectDialog, {});
  }
}
