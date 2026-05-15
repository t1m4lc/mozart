import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthFacade } from '../data/auth.facade';
import { UiWelcomeCard } from '../ui-welcome-card';

// Smart component for /welcome. Wires the AuthFacade to the dumb
// UiWelcomeCard ; owns no presentation of its own beyond the
// full-viewport centering.
@Component({
  selector: 'app-feature-welcome',
  imports: [UiWelcomeCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-h-screen w-full items-center justify-center bg-background',
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
    void this.auth.signIn();
  }

  protected onCancel(): void {
    this.auth.cancelSignIn();
  }

  protected onRetryOpen(): void {
    void this.auth.retryOpenSignIn();
  }
}
