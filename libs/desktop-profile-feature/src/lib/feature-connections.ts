import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideWifiOff } from '@ng-icons/lucide';
import { ConnectivityService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import type { ConnectionProvider } from '@mozart/desktop-profile-util';
import { PROVIDER_REGISTRY } from '@mozart/desktop-llm-model-util';
import {
  type ConfirmDisconnectContext,
  UiConfirmDisconnectDialog,
  UiConnectionCard,
  UiConnectionHelpDialog,
  UiGithubCard,
} from '@mozart/desktop-profile-ui';

// Composes the `/settings` connection list. Provider cards are driven by
// PROVIDER_REGISTRY (the single source of truth) — one card per connectable
// provider (Claude Code, Codex) — followed by the GitHub card.
@Component({
  selector: 'app-feature-connections',
  imports: [UiConnectionCard, UiGithubCard, NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideWifiOff })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-3">
      @if (!connectivity.connected()) {
        <div
          role="status"
          class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <ng-icon hlm name="lucideWifiOff" size="sm" class="mt-0.5 shrink-0" />
          <div>
            <p class="font-medium">No internet connection</p>
            <p class="text-xs opacity-80">
              Hosted LLMs (Anthropic, OpenAI…) are unreachable. Connect once
              you’re back online, or use a local model.
            </p>
          </div>
        </div>
      }
      <div class="space-y-3">
        @for (p of connectableProviders; track p.provider) {
          <app-ui-connection-card
            [connection]="facade.connectionInfoFor(p.provider)()"
            [connectionProvider]="p.provider"
            [label]="p.label"
            (connect)="onConnect(p.provider)"
            (disconnect)="onDisconnect(p.provider)"
            (testConnection)="onTest(p.provider)"
            (useApiKey)="onUseApiKey(p.provider)"
            (help)="onHelp()"
          />
        }
        <app-ui-github-card
          [connected]="facade.githubConnected()"
          [login]="facade.githubLogin()"
          [kind]="facade.githubKind()"
          (connect)="onConnectGithub()"
          (disconnect)="onDisconnectGithub()"
        />
      </div>
    </div>
  `,
})
export class FeatureConnections {
  protected readonly facade = inject(ProfileFacade);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly dialogService = inject(HlmDialogService);

  // Connectable provider tracks + display labels, from the registry source of
  // truth. Each card's title comes from `label` so onboarding, the composer
  // dropdown, and Settings all show the same provider names.
  protected readonly connectableProviders: {
    provider: ConnectionProvider;
    label: string;
  }[] = PROVIDER_REGISTRY.flatMap((d) =>
    d.availability === 'available' && d.connectionProvider
      ? [{ provider: d.connectionProvider, label: d.label }]
      : [],
  );

  constructor() {
    // Lazy probe on first /settings visit. Idempotent — cooperates with the
    // APP_INITIALIZER via the facade's own `status === 'unknown'` guard.
    for (const p of this.connectableProviders) {
      void this.facade.initializeFor(p.provider);
    }
    void this.facade.initializeGithub();
  }

  protected async onConnectGithub(): Promise<void> {
    const { UiGithubConnectDialog } = await import('./ui-github-connect-dialog');
    this.dialogService.open(UiGithubConnectDialog, {});
  }

  protected onDisconnectGithub(): void {
    void this.facade.disconnectGithub();
  }

  // Connect-button flow. The facade re-checks for an existing CLI login
  // session first; if one is found the card flips to "Using … login" with no
  // dialog. Otherwise we open the provider's API-key dialog.
  protected async onConnect(provider: ConnectionProvider): Promise<void> {
    const outcome = await this.facade.tryConnectFor(provider);
    if (outcome === 'needs_api_key') {
      await this.openApiKeyDialog(provider);
    }
  }

  protected async onUseApiKey(provider: ConnectionProvider): Promise<void> {
    await this.openApiKeyDialog(provider);
  }

  protected onTest(provider: ConnectionProvider): void {
    void this.facade.testConnectionFor(provider);
  }

  protected onDisconnect(provider: ConnectionProvider): void {
    const context: ConfirmDisconnectContext = {
      onConfirm: () => {
        void this.facade.disconnectFor(provider);
      },
    };
    this.dialogService.open(UiConfirmDisconnectDialog, { context });
  }

  protected onHelp(): void {
    this.dialogService.open(UiConnectionHelpDialog, {});
  }

  private async openApiKeyDialog(provider: ConnectionProvider): Promise<void> {
    if (provider === 'codex') {
      const { UiCodexConnectDialog } = await import('./ui-codex-connect-dialog');
      this.dialogService.open(UiCodexConnectDialog, {});
      return;
    }
    const { UiConnectDialog } = await import('./ui-connect-dialog');
    this.dialogService.open(UiConnectDialog, {});
  }
}
