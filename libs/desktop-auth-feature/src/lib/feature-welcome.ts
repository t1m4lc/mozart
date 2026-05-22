import {
  ChangeDetectionStrategy,
  Component,
  inject,
  isDevMode,
} from '@angular/core';
import {
  AuthFacade,
  enableDevAuthBypassAndReload,
  isRunningInTauri,
} from '@mozart/desktop-auth-data-access';
import { UiWelcomeCard } from '@mozart/desktop-auth-ui';

// Smart component for /welcome. Wires the AuthFacade to the dumb
// UiWelcomeCard ; owns no presentation of its own beyond the
// full-viewport centering.
@Component({
  selector: 'app-feature-welcome',
  imports: [UiWelcomeCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-full w-full items-center justify-center bg-background',
  },
  template: `
    <app-ui-welcome-card
      [state]="state()"
      [signInUrl]="signInUrl()"
      (signIn)="onSignIn()"
      (cancelled)="onCancel()"
      (retryOpen)="onRetryOpen()"
    />
  `,
})
export class FeatureWelcome {
  private readonly auth = inject(AuthFacade);
  protected readonly state = this.auth.welcomeState;
  protected readonly signInUrl = this.auth.signInUrl;

  protected onSignIn(): void {
    // Plain-browser dev mode: the Clerk deep-link round-trip needs the
    // Tauri shell.open + localhost callback server, neither of which
    // exist outside the wrapper. Calling auth.signIn() here throws
    // "Cannot read properties of undefined (reading 'invoke')" from
    // tauri-auth.adapter.ts. Offer to flip on dev-auth bypass instead.
    if (isDevMode() && !isRunningInTauri()) {
      const proceed = window.confirm(
        'Sign-in needs the Tauri wrapper (shell.open + native deep-link).\n\n' +
          "You're running in a plain browser (pnpm nx serve desktop).\n\n" +
          'Use dev-auth bypass instead? This skips auth + onboarding for ' +
          'local UI testing only. The flag is dev-only — production builds ' +
          'ignore it.',
      );
      if (proceed) enableDevAuthBypassAndReload('/');
      return;
    }
    void this.auth.signIn();
  }

  protected onCancel(): void {
    this.auth.cancelSignIn();
  }

  protected onRetryOpen(): void {
    void this.auth.retryOpenSignIn();
  }
}
