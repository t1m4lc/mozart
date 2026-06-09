import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /logout — ends the web/cloud Clerk session and confirms it. Opened by
// Mozart desktop's Sign out: the desktop clears its local token (it has no
// Clerk SDK to revoke the browser session) then sends the browser here, so
// signing out of desktop also ends the shared web session. No auth guard —
// a harmless no-op when already signed out.
@Component({
  selector: 'app-logout-page',
  imports: [RouterLink, HlmButtonImports, HlmSpinnerImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>{{ done() ? 'Signed out' : 'Signing out…' }}</span>
      <span card-subtitle>
        @if (done()) {
          You've been signed out of Mozart on the web.
        } @else {
          Ending your Mozart web session.
        }
      </span>

      @if (done()) {
        <button hlmBtn type="button" class="w-full" routerLink="/login">
          Sign in again
        </button>
      } @else {
        <hlm-spinner class="size-6" />
      }
    </app-ui-auth-card>
  `,
})
export class LogoutPage {
  private readonly auth = inject(AuthFacade);

  /** Flips to true once the sign-out attempt settles (success or failure) —
   *  drives the spinner → confirmation swap. */
  protected readonly done = signal(false);

  constructor() {
    void this.runSignOut();
  }

  private async runSignOut(): Promise<void> {
    try {
      await this.auth.signOut({ redirect: false });
    } catch (err) {
      console.warn('[logout] sign-out failed:', err);
    } finally {
      this.done.set(true);
    }
  }
}
