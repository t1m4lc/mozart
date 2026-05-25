import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmCollapsibleImports } from '@spartan-ui/collapsible';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { HlmSeparatorImports } from '@spartan-ui/separator';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideExternalLink,
  lucideGithub,
} from '@ng-icons/lucide';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';

// PAT-creation URL prefilled with the scopes Mozart needs.
// `repo` covers all classic-PAT repo operations + private push/PR;
// `workflow` is included so users can also push to repos with GitHub
// Actions configs.
const GITHUB_TOKEN_NEW_URL =
  'https://github.com/settings/tokens/new?scopes=repo,workflow&description=Mozart';

// Two paths to a GitHub credential:
//   1. Primary — "Connect with GitHub". Reuses the user's existing Clerk
//      session JWT. The apps/web Pages Function calls Clerk's Backend SDK
//      to retrieve the GitHub OAuth token. Zero-friction when the user
//      signed in to Mozart with GitHub via Clerk.
//   2. Advanced — paste a personal access token. Same flow as before;
//      Mozart never sees your GitHub password.
@Component({
  selector: 'app-ui-github-connect-dialog',
  imports: [
    HlmButtonImports,
    HlmCollapsibleImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
    HlmSeparatorImports,
    NgIcon,
  ],
  providers: [
    provideIcons({ lucideChevronDown, lucideExternalLink, lucideGithub }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Connect GitHub</h3>
      <p hlmDialogDescription>
        Mozart uses your GitHub account to open pull requests on your
        behalf. The token lives in your OS keychain — we never see your
        password.
      </p>
    </div>

    <div class="px-6 py-4 space-y-4">
      <div class="space-y-2">
        <button
          hlmBtn
          variant="default"
          type="button"
          class="w-full justify-center gap-2"
          (click)="onConnectWithClerk()"
          [disabled]="busy()"
        >
          <ng-icon hlm name="lucideGithub" size="sm" />
          @if (busy() && busyPath() === 'clerk') {
            Connecting…
          } @else {
            Connect with GitHub
          }
        </button>
        <p class="text-xs text-muted-foreground">
          Uses your Mozart sign-in. Instant if you signed in with GitHub;
          otherwise link GitHub in your Mozart account or paste a token
          below.
        </p>
        @if (clerkError(); as err) {
          <p class="text-xs text-destructive">{{ err }}</p>
        }
      </div>

      <hlm-collapsible
        [expanded]="advancedExpanded()"
        (expandedChange)="advancedExpanded.set($event)"
      >
        <button
          hlmCollapsibleTrigger
          hlmBtn
          variant="ghost"
          type="button"
          size="sm"
          class="w-full justify-between px-2 text-xs text-muted-foreground"
          (click)="advancedExpanded.set(!advancedExpanded())"
        >
          <span>Advanced — use a personal access token</span>
          <ng-icon
            name="lucideChevronDown"
            class="transition-transform"
            [class.rotate-180]="advancedExpanded()"
          />
        </button>
        <div hlmCollapsibleContent class="pt-3 space-y-3">
          <button
            hlmBtn
            variant="outline"
            type="button"
            class="w-full justify-center gap-2"
            (click)="onOpenGithub()"
            [disabled]="busy()"
          >
            Generate a token on GitHub
            <ng-icon hlm name="lucideExternalLink" size="xs" />
          </button>
          <p class="text-xs text-muted-foreground">
            Opens GitHub with
            <code class="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">repo</code>
            +
            <code class="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">workflow</code>
            scopes prefilled. Paste the token below.
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
            (keydown.enter)="onConnectWithToken()"
          />
          @if (patError(); as err) {
            <p class="text-xs text-destructive">{{ err }}</p>
          }
          <button
            hlmBtn
            variant="secondary"
            type="button"
            class="w-full justify-center"
            [disabled]="!canConnectWithToken()"
            (click)="onConnectWithToken()"
          >
            @if (busy() && busyPath() === 'pat') {
              Verifying token…
            } @else {
              Connect with token
            }
          </button>
        </div>
      </hlm-collapsible>
    </div>

    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
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
  protected readonly busyPath = signal<'clerk' | 'pat' | null>(null);
  protected readonly clerkError = signal<string | null>(null);
  protected readonly patError = signal<string | null>(null);
  protected readonly advancedExpanded = signal(false);

  protected readonly canConnectWithToken = computed(
    () => !this.busy() && this.token().trim().length > 0,
  );

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLInputElement).value);
    if (this.patError()) this.patError.set(null);
  }

  protected onOpenGithub(): void {
    void this.externalLink.openExternal(GITHUB_TOKEN_NEW_URL);
  }

  protected async onConnectWithClerk(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.busyPath.set('clerk');
    this.clerkError.set(null);
    try {
      const outcome = await this.facade.connectGithubViaClerk();
      if (outcome.kind === 'ok') {
        this.ref.close();
        return;
      }
      if (outcome.kind === 'unauthorized') {
        this.clerkError.set(
          'GitHub rejected the OAuth token. Re-authenticate with GitHub, or use a personal access token below.',
        );
      } else {
        this.clerkError.set(`Network error: ${outcome.message}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface the not_linked / no-session paths with a tighter hint
      // that points to the PAT escape hatch right below.
      if (/no GitHub account linked/i.test(message)) {
        this.clerkError.set(
          'No GitHub account is linked to your Mozart sign-in. Sign in with GitHub from your account page, or use a personal access token below.',
        );
        this.advancedExpanded.set(true);
      } else if (/no Mozart session/i.test(message)) {
        this.clerkError.set(
          'Sign in to Mozart first, then try again. Or use a personal access token below.',
        );
      } else {
        this.clerkError.set(message);
      }
    } finally {
      this.busy.set(false);
      this.busyPath.set(null);
    }
  }

  protected async onConnectWithToken(): Promise<void> {
    if (!this.canConnectWithToken()) return;
    this.busy.set(true);
    this.busyPath.set('pat');
    this.patError.set(null);
    try {
      const outcome = await this.facade.connectGithub(this.token().trim());
      if (outcome.kind === 'ok') {
        this.ref.close();
        return;
      }
      if (outcome.kind === 'unauthorized') {
        this.patError.set(
          'Token rejected by GitHub. Check the scopes and try again.',
        );
      } else {
        this.patError.set(`Network error: ${outcome.message}`);
      }
    } catch (err) {
      this.patError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
      this.busyPath.set(null);
    }
  }
}
