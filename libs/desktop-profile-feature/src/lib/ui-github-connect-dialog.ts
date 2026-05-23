import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { HlmSeparatorImports } from '@spartan-ui/separator';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink, lucideGithub } from '@ng-icons/lucide';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';

// PAT-creation URL prefilled with the scopes Mozart needs.
// `repo` covers all classic-PAT repo operations + private push/PR;
// `workflow` is included so users can also push to repos with GitHub
// Actions configs.
const GITHUB_TOKEN_NEW_URL =
  'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Mozart';

// Two paths to a GitHub credential:
//   1. Sign in with GitHub : opens the browser to the PAT-creation
//      page with the right scopes prefilled (the "guided" path). User
//      pastes the resulting token back here.
//   2. Use an existing token : same paste-and-verify flow as before.
// Both end up storing a PAT in the OS keyring via the credentials
// adapter — Mozart never sees the GitHub OAuth secret.
@Component({
  selector: 'app-ui-github-connect-dialog',
  imports: [
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
    HlmSeparatorImports,
    NgIcon,
  ],
  providers: [provideIcons({ lucideExternalLink, lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Connect GitHub</h3>
      <p hlmDialogDescription>
        Two ways — both store a personal access token in your OS
        keychain. Mozart never sees your GitHub password.
      </p>
    </div>

    <div class="px-6 py-4 space-y-4">
      <div class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sign in with GitHub
        </p>
        <button
          hlmBtn
          variant="default"
          type="button"
          class="w-full justify-center gap-2"
          (click)="onOpenGithub()"
          [disabled]="busy()"
        >
          <ng-icon hlm name="lucideGithub" size="sm" />
          Generate a token on GitHub
          <ng-icon hlm name="lucideExternalLink" size="xs" />
        </button>
        <p class="text-xs text-muted-foreground">
          Opens GitHub in your browser with
          <code class="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">repo</code>
          + <code class="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">workflow</code>
          scopes prefilled. Click "Generate token" on GitHub, then paste
          it below.
        </p>
      </div>

      <hlm-separator />

      <div class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Or paste an existing token
        </p>
        <input
          type="password"
          hlmInput
          class="w-full font-mono text-sm"
          placeholder="ghp_…"
          autocomplete="off"
          spellcheck="false"
          [value]="token()"
          (input)="onTokenInput($event)"
          (keydown.enter)="onConnect()"
        />
        @if (error(); as err) {
          <p class="text-xs text-destructive">{{ err }}</p>
        }
      </div>
    </div>

    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="!canConnect()"
        (click)="onConnect()"
      >
        @if (busy()) {
          Verifying…
        } @else {
          Connect
        }
      </button>
    </div>
  `,
})
export class UiGithubConnectDialog {
  private readonly ref = inject(BrnDialogRef);
  private readonly facade = inject(ProfileFacade);
  private readonly externalLink = inject(ExternalLinkService);

  protected readonly token = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
    if (this.error()) this.error.set(null);
  }

  protected canConnect(): boolean {
    return !this.busy() && this.token().trim().length > 0;
  }

  protected onOpenGithub(): void {
    void this.externalLink.openExternal(GITHUB_TOKEN_NEW_URL);
  }

  protected async onConnect(): Promise<void> {
    if (!this.canConnect()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const outcome = await this.facade.connectGithub(this.token().trim());
      if (outcome.kind === 'ok') {
        this.ref.close();
        return;
      }
      if (outcome.kind === 'unauthorized') {
        this.error.set('Token rejected by GitHub. Check the scopes and try again.');
      } else {
        this.error.set(`Network error: ${outcome.message}`);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
