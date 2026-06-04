import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmAlertImports } from '@spartan-ui/alert';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmEmptyImports } from '@spartan-ui/empty';
import { HlmTypographyImports } from '@spartan-ui/typography';
import type { WelcomeState } from '@mozart/desktop-auth-util';

// Dumb presentational component for /welcome. Mirrors the layout in
// docs/engineering/specs/onboarding-and-auth.md §2.2 : logo, heading, subtitle,
// primary button, optional sub-line + ghost Cancel during `opening`.
//
// The 'authenticating' state from earlier iterations was removed once
// the storage backend switched from Stronghold to OS keyring — the
// keyring round-trip is fast enough that the page just routes to /
// without a perceptible delay. Reintroduce a transitional state only
// if some future storage path reintroduces a noticeable save lag.
@Component({
  selector: 'app-ui-welcome-card',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmTypographyImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-empty class="border-none p-0 pb-40">
      <hlm-empty-media>
        <img src="/assets/shared/logos/mozart-logo.svg" alt="Mozart" class="size-16" />
      </hlm-empty-media>

      <hlm-empty-header>
        <h1 hlmH1 class="text-3xl">Start composing</h1>
        <p hlmLead class="text-base">
          @switch (state()) {
            @case ('opening') {
              Finish sign in in the browser window.
            }
            @case ('timed-out') {
              Sign in is taking longer than expected.
            }
            @default {
              Sign in to continue
            }
          }
        </p>
      </hlm-empty-header>

      <hlm-empty-content>
        @if (state() === 'timed-out') {
          <div hlmAlert class="mb-2 max-w-sm">
            <p hlmAlertDescription>Try again or check your browser window.</p>
          </div>
        }

        <button
          hlmBtn
          type="button"
          [disabled]="state() === 'opening'"
          (click)="signIn.emit()"
        >
          {{
            state() === 'opening'
              ? 'Opening browser…'
              : state() === 'timed-out'
                ? 'Try again'
                : 'Sign in'
          }}
        </button>

        @if (state() === 'opening' && signInUrl()) {
          <p hlmMuted class="text-center text-xs">
            Browser didn't open?
            <button
              hlmBtn
              variant="link"
              type="button"
              class="h-auto p-0 text-xs"
              (click)="retryOpen.emit()"
            >
              Try again
            </button>
          </p>
        }

        @if (state() === 'opening' || state() === 'timed-out') {
          <button
            hlmBtn
            variant="ghost"
            type="button"
            (click)="cancelled.emit()"
          >
            Cancel
          </button>
        }
      </hlm-empty-content>
    </hlm-empty>
  `,
})
export class UiWelcomeCard {
  readonly state = input.required<WelcomeState>();
  /** Non-null while a sign-in is in flight — surfaces the "Try again"
   *  link so the user can re-fire `shell.open` if their browser
   *  failed to handle the first attempt. */
  readonly signInUrl = input<string | null>(null);
  readonly signIn = output<void>();
  readonly cancelled = output<void>();
  readonly retryOpen = output<void>();
}
