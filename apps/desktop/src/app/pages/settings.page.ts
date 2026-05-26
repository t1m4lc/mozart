import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthFacade } from '@mozart/desktop-auth-data-access';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { FeatureGitStatus } from '@mozart/desktop-onboarding-feature';
import {
  FeatureConnections,
  FeatureNotificationPrefs,
} from '@mozart/desktop-profile-feature';
import {
  TimelinePrefsService,
  type TimelineDensity,
} from '@mozart/desktop-ui-state-data-access';
import { ThemeService, type ThemeMode } from '@mozart/shared-util-theme';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmSelectImports } from '@spartan-ui/select';

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
    HlmSelectImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full overflow-y-auto p-6' },
  template: `
    <div class="mx-auto max-w-3xl space-y-8">
      <h1 class="text-2xl font-semibold">Settings</h1>

      <section class="space-y-4">
        <h2
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Connections
        </h2>
        <app-feature-connections />
      </section>

      <section class="space-y-4">
        <h2
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Git
        </h2>
        <app-feature-git-status />
      </section>

      <section class="space-y-4">
        <h2
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Notifications
        </h2>
        <app-feature-notification-prefs />
      </section>

      <section class="space-y-4">
        <h2
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Appearance
        </h2>
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Theme</p>
            <p class="text-xs text-muted-foreground">
              Follow your system setting, or lock to light or dark.
            </p>
          </div>
          <hlm-select
            [value]="_theme.mode()"
            (valueChange)="onSetMode($any($event))"
            [itemToString]="_modeToString"
          >
            <hlm-select-trigger class="w-28 h-8 text-xs">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-group>
                @for (opt of _themeModes; track opt.value) {
                  <hlm-select-item [value]="opt.value">
                    {{ opt.label }}
                  </hlm-select-item>
                }
              </hlm-select-group>
            </hlm-select-content>
          </hlm-select>
        </div>
        <!-- Timeline density is hidden until the timeline density
             behavior is solid enough to ship. Restore by uncommenting
             this block (the wired-up handlers + select options below
             stay in place). -->
        <!-- <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Timeline density</p>
            <p class="text-xs text-muted-foreground">
              Choose how much of the agent's activity shows up in the chat.
            </p>
          </div>
          <hlm-select
            [value]="_timelinePrefs.density()"
            (valueChange)="onSetDensity($any($event))"
            [itemToString]="_densityToString"
          >
            <hlm-select-trigger class="w-28 h-8 text-xs">
              <hlm-select-value />
            </hlm-select-trigger>
            <hlm-select-content *hlmSelectPortal>
              <hlm-select-group>
                @for (opt of _densityOptions; track opt.value) {
                  <hlm-select-item [value]="opt.value">
                    {{ opt.label }}
                  </hlm-select-item>
                }
              </hlm-select-group>
            </hlm-select-content>
          </hlm-select>
        </div> -->
      </section>

      <section class="space-y-4">
        <h2
          class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Account
        </h2>
        <div
          class="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/30 p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Web account</p>
            <p class="text-xs text-muted-foreground">
              Manage your profile on the Mozart web app.
            </p>
          </div>
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="onOpenAccount()"
          >
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
  private readonly auth = inject(AuthFacade);
  private readonly externalLink = inject(ExternalLinkService);
  protected readonly _theme = inject(ThemeService);
  protected readonly _timelinePrefs = inject(TimelinePrefsService);

  protected readonly _themeModes: { label: string; value: ThemeMode }[] = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ];

  protected readonly _densityOptions: {
    label: string;
    value: TimelineDensity;
  }[] = [
    { label: 'Compact', value: 'compact' },
    { label: 'Normal', value: 'normal' },
    { label: 'Detailed', value: 'detailed' },
  ];

  protected readonly _modeToString = (mode: ThemeMode): string =>
    this._themeModes.find((o) => o.value === mode)?.label ?? '';

  protected readonly _densityToString = (level: TimelineDensity): string =>
    this._densityOptions.find((o) => o.value === level)?.label ?? '';

  protected onSetMode(mode: ThemeMode): void {
    this._theme.setMode(mode);
  }

  protected onSetDensity(level: TimelineDensity): void {
    this._timelinePrefs.setDensity(level);
  }

  protected onSignOut(): void {
    void this.auth.signOut();
  }

  protected onOpenAccount(): void {
    void this.externalLink.openExternal(WEB_ACCOUNT_URL);
  }
}
