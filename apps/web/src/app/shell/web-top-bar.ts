import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmThemeToggle } from '@mozart-ui/theme-toggle';
import { HlmButton } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';
import { AuthFacade } from '../domains/auth';

// Sticky top bar for apps/web destination pages (/account, future
// cloud routes). Logo left, theme toggle + sign-out right.
//
// Sign-out is wrapped in try/finally so a Clerk-side failure can't
// leave the button stuck in the disabled "Signing out…" state.
@Component({
  selector: 'app-web-top-bar',
  imports: [
    RouterLink,
    HlmThemeToggle,
    HlmButton,
    HlmIconImports,
    HlmTooltipImports,
    NgIcon,
  ],
  providers: [provideIcons({ lucideLogOut })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'sticky top-0 z-40 block w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
  },
  template: `
    <div
      class="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6"
    >
      <a
        routerLink="/dashboard"
        aria-label="Mozart"
        hlmTooltip="Mozart"
        position="right"
        class="flex h-10 w-10 shrink-0 items-center justify-center"
      >
        <img
          src="/assets/shared/logos/mozart-logo.svg"
          alt="Mozart"
          width="40"
          height="40"
          class="h-10 w-10"
        />
      </a>

      <div class="flex items-center gap-2">
        <mz-theme-toggle />
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          type="button"
          [disabled]="signingOut()"
          (click)="onSignOut()"
        >
          <ng-icon hlm name="lucideLogOut" size="sm" />
          {{ signingOut() ? 'Signing out…' : 'Sign out' }}
        </button>
      </div>
    </div>
  `,
})
export class WebTopBar {
  private readonly auth = inject(AuthFacade);
  protected readonly signingOut = signal(false);

  protected async onSignOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      // Reset even on success so a failed redirect (Clerk error, network
      // blip) leaves the button usable instead of permanently disabled.
      this.signingOut.set(false);
    }
  }
}
