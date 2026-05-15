import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTypographyImports } from '@mozart/ui/typography';
import { AuthFacade } from './data/auth.facade';
import { UiAuthCard } from './ui-auth-card';
import { isMobileUserAgent } from './util-detect-mobile';

// Smart component for /dashboard. Owns :
//   - greeting copy ("Happy to see you again, {firstName}")
//   - the `Launch Mozart desktop` button → builds `mozart://auth?...`
//     and navigates the anchor (browser hands off to the OS protocol
//     handler ; tauri-plugin-deep-link picks it up on the desktop side)
//   - mobile UA gate : hide the launch button + show desktop-only copy
//
// The `state` nonce travels through `AuthFacade._oauthState` (set on
// /login, mirrored to localStorage) and is replayed into the
// deep-link via `buildDesktopLaunchUrl`.
//
// FIXME(phase-5-followup, linux-deeplink) : on Linux (Ubuntu, Chrome
// native + Firefox via Mozilla PPA), the browser shows the OS
// "open external application?" prompt for `mozart://` and Chrome's
// own console logs `Launched external handler`, BUT Mozart never
// receives the URL — silently dropped between the browser and the
// OS handler. `xdg-open` and `gio open` from a terminal both reach
// Mozart, so the deep-link transport itself is fine ; only the
// browser-launched path breaks. Works correctly on macOS and Windows.
//
// Recommended fix (deferred) : pivot to a localhost HTTP endpoint
// served by Tauri (e.g. `127.0.0.1:<random-port>/auth?token=…&state=…`).
// Browser → HTTP localhost has no scheme-handler quirks and is
// uniform across OSes. Keep `mozart://` as the email/Magic-Link
// fallback for post-MVP. Full diagnostic + alternatives :
//   ~/.gstack/projects/t1m4lc-mozart/checkpoints/
//     20260515-181132-phase-5-auth-atom-5-blocked-on-linux-deeplink.md
//
// Until the fix : Linux users see the prompt, click Open, nothing
// visible happens. The passive "Didn't open? Download Mozart" link
// below the button is the current workaround surface.

@Component({
  selector: 'app-feature-launch-mozart',
  imports: [HlmButtonImports, HlmTypographyImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Happy to see you again, {{ firstName() }} 👋</span>
      <span card-subtitle>
        @if (isMobile()) {
          Mozart is desktop-only.
        } @else {
          Click to open Mozart on your computer.
        }
      </span>

      @if (isMobile()) {
        <p hlmMuted class="text-center text-sm">
          Sign in from your computer to launch the app.
        </p>
        <a hlmBtn variant="outline" href="https://mozart.build/download">
          Download Mozart
        </a>
      } @else {
        <a
          hlmBtn
          [href]="launchUrl()"
          class="w-full"
          (click)="onLaunchClick($event)"
        >
          Launch Mozart desktop
        </a>

        <p hlmMuted class="text-center text-xs">
          Didn't open?
          <a
            hlmBtn
            variant="link"
            href="https://mozart.build/download"
            class="h-auto p-0 text-xs"
          >
            Download Mozart
          </a>
        </p>
      }
    </app-ui-auth-card>
  `,
})
export class FeatureLaunchMozart {
  private readonly auth = inject(AuthFacade);

  protected readonly isMobile = signal(
    typeof navigator !== 'undefined'
      ? isMobileUserAgent(navigator.userAgent)
      : false,
  );
  protected readonly firstName = computed(() => {
    const fullName = this.auth.user()?.name ?? '';
    return fullName.split(' ')[0] || 'there';
  });

  /** Resolved into the anchor's `href`. Falls back to `#` if we are
   *  missing the user or the OAuth state — clicking does nothing in
   *  that edge case (caught in `onLaunchClick`). */
  protected readonly launchUrl = computed(
    () => this.auth.buildDesktopLaunchUrl() ?? '#',
  );

  protected onLaunchClick(event: MouseEvent): void {
    const url = this.auth.buildDesktopLaunchUrl();
    if (!url) {
      event.preventDefault();
      console.warn('[launch] missing user or state — cannot build deep-link');
      return;
    }
    // Anchor navigation handles the rest. See the FIXME at the top
    // of this file for the Linux-specific limitation.
  }
}
