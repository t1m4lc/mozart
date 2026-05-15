import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { HlmTypographyImports } from '@mozart/ui/typography';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideLogOut,
  lucideRefreshCw,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { AuthFacade } from './data/auth.facade';
import { isMobileUserAgent } from './util-detect-mobile';

// Smart component that owns the browser → desktop handoff. Reused by
// both /login (when the user is already authed) and /dashboard
// (right after the OAuth round-trip).
//
// UX states :
//   - mobile UA       : desktop-only message + download link
//   - idle            : "Launch Mozart desktop" button (initial)
//   - connecting      : spinner + "Connecting to Mozart…"
//   - success         : ✓ + "You're signed in 🎉" + close-tab hint
//   - unreachable     : ⚠ + "Mozart isn't responding" + retry + download
//
// Why no auto-fire on mount : the explicit click gives the user a
// clear mental model. If their desktop isn't running, they discover
// that on their terms, not as a confusing flash.
//
// Why HTTP loopback instead of `<a href="mozart://…">` : browsers on
// Linux (Chrome native, Firefox via Mozilla PPA) silently drop the
// custom-scheme launch even though their own console logs "Launched
// external handler". A loopback `fetch` from the same browser has
// none of that drama and is uniform across OSes.

type LaunchState = 'idle' | 'connecting' | 'success' | 'unreachable';

@Component({
  selector: 'app-feature-launch-mozart',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmSpinnerImports,
    HlmTypographyImports,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCheck,
      lucideLogOut,
      lucideRefreshCw,
      lucideTriangleAlert,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMobile()) {
      <p hlmMuted class="text-center text-sm">
        Mozart is desktop-only. Sign in from your computer to launch
        the app.
      </p>
      <a hlmBtn variant="outline" href="https://mozart.build/download">
        Download Mozart
      </a>
    } @else {
      @switch (state()) {
        @case ('idle') {
          <button
            hlmBtn
            type="button"
            class="w-full"
            (click)="onLaunch()"
          >
            Launch Mozart desktop
            <ng-icon hlm name="lucideArrowRight" size="sm" />
          </button>
        }
        @case ('connecting') {
          <button hlmBtn type="button" class="w-full" [disabled]="true">
            <hlm-spinner class="size-4" />
            Connecting to Mozart…
          </button>
        }
        @case ('success') {
          <div class="flex flex-col items-center gap-3">
            <div
              class="bg-brand-subtle text-brand ring-brand/30 flex size-14 items-center justify-center rounded-full ring-1"
              aria-label="Success"
            >
              <ng-icon name="lucideCheck" size="lg" />
            </div>
            <p hlmP class="text-center text-sm">
              You're signed in. Switch back to Mozart on your computer
              to continue.
            </p>
            <p hlmMuted class="text-center text-xs">
              You can close this tab now.
            </p>
          </div>
        }
        @case ('unreachable') {
          <div class="flex flex-col items-center gap-3">
            <div
              class="bg-destructive/10 text-destructive ring-destructive/30 flex size-14 items-center justify-center rounded-full ring-1"
              aria-label="Mozart isn't responding"
            >
              <ng-icon name="lucideTriangleAlert" size="lg" />
            </div>
            <p hlmP class="text-center text-sm">
              Mozart desktop isn't responding. Open Mozart on your
              computer, then try again.
            </p>
            <button
              hlmBtn
              type="button"
              class="w-full"
              (click)="onLaunch()"
            >
              <ng-icon hlm name="lucideRefreshCw" size="sm" />
              Try again
            </button>
            <p hlmMuted class="text-center text-xs">
              Don't have Mozart yet?
              <a
                hlmBtn
                variant="link"
                href="https://mozart.build/download"
                class="h-auto p-0 text-xs"
              >
                Download
              </a>
            </p>
          </div>
        }
      }

      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-foreground mt-2"
        [disabled]="signingOut()"
        (click)="onSignOut()"
      >
        <ng-icon hlm name="lucideLogOut" size="xs" />
        {{ signingOut() ? 'Signing out…' : 'Sign out' }}
      </button>
    }
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

  protected readonly state = signal<LaunchState>('idle');
  protected readonly signingOut = signal(false);

  protected async onLaunch(): Promise<void> {
    if (this.state() === 'connecting') return;
    this.state.set('connecting');
    const outcome = await this.auth.triggerDesktopSignIn();
    // 'invalid' (missing user/state/port) folds into 'unreachable' :
    // the retry button + download link is the right surface either
    // way. The desktop side detects the actual edge case.
    this.state.set(outcome === 'success' ? 'success' : 'unreachable');
  }

  protected async onSignOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }
}
