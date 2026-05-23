import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { AuthFacade } from '@mozart/desktop-auth-data-access';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';
import { FeatureGitStatus } from '@mozart/desktop-onboarding-feature';
import {
  FeatureConnections,
  FeatureNotificationPrefs,
} from '@mozart/desktop-profile-feature';

// Web account URL. Mirrors `buildSignInUrl` — same dev origin, just a
// different path. Production deploy will swap this to app.mozart.build.
const WEB_ACCOUNT_URL = 'https://app.mozart.build/account';

@Component({
  selector: 'app-settings-page',
  imports: [
    FeatureConnections,
    FeatureGitStatus,
    FeatureNotificationPrefs,
    HlmButtonImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full overflow-y-auto p-6' },
  template: `
    <div class="mx-auto max-w-3xl space-y-8">
      <h1 class="text-2xl font-semibold">Settings</h1>

      <section class="space-y-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Connections
        </h2>
        <app-feature-connections />
      </section>

      <section class="space-y-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Git
        </h2>
        <app-feature-git-status />
      </section>

      <section class="space-y-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notifications
        </h2>
        <app-feature-notification-prefs />
      </section>

      <section class="space-y-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Onboarding
        </h2>
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Revisit the tour</p>
            <p class="text-xs text-muted-foreground">
              Replay the 5-step welcome tour on the Get started project.
            </p>
          </div>
          <button hlmBtn variant="outline" type="button" (click)="onRevisitTour()">
            Replay tour
          </button>
        </div>
      </section>

      <section class="space-y-4">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Account
        </h2>
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Web account</p>
            <p class="text-xs text-muted-foreground">
              Manage billing, team, and profile on the Mozart web app.
            </p>
          </div>
          <button hlmBtn variant="outline" type="button" (click)="onOpenAccount()">
            Account
          </button>
        </div>
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Sign out</p>
            <p class="text-xs text-muted-foreground">
              Clears the local session and returns to the welcome screen.
            </p>
          </div>
          <button hlmBtn variant="outline" type="button" (click)="onSignOut()">
            Sign out
          </button>
        </div>
      </section>
    </div>
  `,
})
export class SettingsPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);
  private readonly onboarding = inject(OnboardingFacade);
  private readonly externalLink = inject(ExternalLinkService);

  protected onRevisitTour(): void {
    // Reset doesn't actually re-arm the wizard here ; we just navigate
    // into /tour which is idempotent and reuses the existing
    // get-started repo + workspace. Leaving `onboarding_completed`
    // as true so the user isn't routed back through the wizard if
    // they Skip the tour.
    void this.router.navigate(['/tour']);
    // Keep facade state coherent for any later UI that reads from it.
    this.onboarding.markStep('welcome', 'done');
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }

  protected onOpenAccount(): void {
    void this.externalLink.openExternal(WEB_ACCOUNT_URL);
  }
}
