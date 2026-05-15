import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmCardImports } from '@mozart/ui/card';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleDot,
  lucideHardDrive,
  lucideRouter,
  lucideSparkles,
  lucideZap,
} from '@ng-icons/lucide';
import { ProfileFacade, UiConnectDialog } from '../profile';
import { OnboardingFacade } from './data/onboarding.facade';
import { FeatureClaudeLoginPty } from './feature-claude-login-pty';
import { UiDisclosureCard } from './ui-disclosure-card';

interface ProviderEntry {
  readonly id: 'claude' | 'openai' | 'openrouter' | 'local';
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly enabled: boolean;
}

const PROVIDERS: readonly ProviderEntry[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'The flagship agent — recommended.',
    icon: 'lucideSparkles',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'gpt-4o, gpt-4.1',
    icon: 'lucideZap',
    enabled: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-model gateway',
    icon: 'lucideRouter',
    enabled: false,
  },
  {
    id: 'local',
    name: 'Local (Ollama)',
    description: 'Run models on your machine',
    icon: 'lucideHardDrive',
    enabled: false,
  },
] as const;

// Step 3 of the onboarding wizard. Lists supported providers and offers
// either the embedded `claude login` PTY or an API-key dialog fallback.
// Continue is gated on `ProfileFacade.connection()` reaching a
// connected state (either Claude Code session or stored Anthropic key).
@Component({
  selector: 'app-feature-onboarding-step-provider',
  imports: [
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmIconImports,
    NgIcon,
    UiDisclosureCard,
    FeatureClaudeLoginPty,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleDot,
      lucideHardDrive,
      lucideRouter,
      lucideSparkles,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (showPty()) {
      <app-feature-claude-login-pty
        [active]="showPty()"
        (success)="onPtySuccess()"
        (cancel)="onPtyCancel()"
        (useApiKey)="onUseApiKey()"
      />
    } @else {
      <div class="space-y-6">
        <div class="space-y-1 text-center">
          <h2 class="text-xl font-semibold">Connect an LLM provider</h2>
          <p class="text-sm text-muted-foreground">
            You need at least one model provider to use Mozart's agent.
          </p>
        </div>

        <div class="space-y-3">
          @for (provider of providers; track provider.id) {
            <div
              hlmCard
              class="flex items-center justify-between gap-3 p-4"
              [class.opacity-60]="!provider.enabled"
            >
              <div class="flex items-center gap-3">
                <ng-icon hlm [name]="provider.icon" size="sm" />
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{{ provider.name }}</span>
                    @if (provider.id === 'claude' && providerReady()) {
                      <ng-icon
                        hlm
                        name="lucideCheck"
                        size="xs"
                        class="text-emerald-600"
                      />
                    }
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ provider.description }}
                  </p>
                </div>
              </div>
              @if (provider.enabled) {
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  (click)="onConfigureClaude()"
                >
                  {{ providerReady() ? 'Reconfigure' : 'Configure' }}
                </button>
              } @else {
                <span hlmBadge variant="outline" class="text-xs">Coming soon</span>
              }
            </div>
          }
        </div>

        <app-ui-disclosure-card />

        <div class="flex items-center justify-between gap-3">
          <button
            hlmBtn
            variant="ghost"
            type="button"
            (click)="facade.back()"
          >
            Back
          </button>
          <button
            hlmBtn
            type="button"
            [disabled]="!providerReady()"
            (click)="facade.advance()"
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
  protected readonly showPty = signal<boolean>(false);

  protected readonly providerReady = computed(() => {
    const status = this.profile.connection().status;
    return status === 'connected' || status === 'connected_via_claude_code';
  });

  constructor() {
    // Probe on mount so we catch a pre-existing API key / session.
    void this.profile.initialize();
    // Keep facade's step-status mirror in sync with the provider state.
    effect(() => {
      this.facade.markStep('provider', this.providerReady() ? 'done' : 'pending');
    });
  }

  protected async onConfigureClaude(): Promise<void> {
    // Re-check Claude Code session first — a Pro/Max user who already
    // ran `claude login` gets a one-click experience here.
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

  protected onUseApiKey(): void {
    this.showPty.set(false);
    this.dialog.open(UiConnectDialog, {});
  }
}
