import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideWifiOff } from '@ng-icons/lucide';
import { ConnectivityService } from '../../core/connectivity.service';
import { ProfileFacade } from './data/profile.facade';
import { UiConnectDialog } from './ui-connect-dialog';
import {
  ConfirmDisconnectContext,
  UiConfirmDisconnectDialog,
} from './ui-confirm-disconnect-dialog';
import { UiConnectionCard } from './ui-connection-card';
import { UiConnectionHelpDialog } from './ui-connection-help-dialog';
import { UiGithubCard } from './ui-github-card';
import { UiGithubConnectDialog } from './ui-github-connect-dialog';

// Composes the `/settings` connection list. v0.0.1 ships one live card
// (Anthropic) and a disabled placeholder (GitHub). v0.1.0 turns the
// placeholder into a real integration.
@Component({
  selector: 'app-feature-connections',
  imports: [UiConnectionCard, UiGithubCard, NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideWifiOff })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="space-y-3">
      <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Connections
      </h2>
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
        <app-ui-connection-card
          [connection]="facade.connection()"
          (connect)="onConnect()"
          (disconnect)="onDisconnect()"
          (testConnection)="onTestConnection()"
          (useApiKey)="onUseApiKey()"
          (help)="onHelp()"
        />
        <app-ui-github-card
          [connected]="facade.githubConnected()"
          [login]="facade.githubLogin()"
          (connect)="onConnectGithub()"
          (disconnect)="onDisconnectGithub()"
        />
      </div>
    </section>
  `,
})
export class FeatureConnections {
  protected readonly facade = inject(ProfileFacade);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly dialogService = inject(HlmDialogService);

  constructor() {
    // Lazy probe on first /settings visit. Idempotent — the APP_INITIALIZER
    // (in app.config.ts) and this call cooperate via the facade's own
    // guard (`status === 'unknown'`).
    void this.facade.initialize();
    void this.facade.initializeGithub();
  }

  protected onConnectGithub(): void {
    this.dialogService.open(UiGithubConnectDialog, {});
  }

  protected onDisconnectGithub(): void {
    void this.facade.disconnectGithub();
  }

  // Connect-button flow. The facade re-checks the claude /login session
  // first; if one is found the card flips to "Using Claude Code" with no
  // dialog. Otherwise we open the API-key dialog.
  protected async onConnect(): Promise<void> {
    const outcome = await this.facade.tryConnect();
    if (outcome === 'needs_api_key') {
      this.openApiKeyDialog();
    }
  }

  // From the "Using Claude Code" state, the user can switch to an API
  // key directly — same dialog as the not_connected → Connect path.
  protected onUseApiKey(): void {
    this.openApiKeyDialog();
  }

  protected onDisconnect(): void {
    const context: ConfirmDisconnectContext = {
      onConfirm: () => {
        void this.facade.disconnect();
      },
    };
    this.dialogService.open(UiConfirmDisconnectDialog, { context });
  }

  protected onTestConnection(): void {
    void this.facade.testConnection();
  }

  protected onHelp(): void {
    this.dialogService.open(UiConnectionHelpDialog, {});
  }

  private openApiKeyDialog(): void {
    this.dialogService.open(UiConnectDialog, {});
  }
}
