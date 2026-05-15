import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmEmptyImports } from '@mozart/ui/empty';
import { HlmTypographyImports } from '@mozart/ui/typography';
import type { WelcomeState } from './data/auth.model';

// Dumb presentational component for /welcome. Mirrors the layout in
// docs/specs/onboarding-and-auth.md §2.2 : logo, heading, subtitle,
// primary button, optional sub-line + ghost Cancel during `opening`.
@Component({
  selector: 'app-ui-welcome-card',
  imports: [HlmButtonImports, HlmEmptyImports, HlmTypographyImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-empty class="border-none p-0">
      <hlm-empty-media>
        <img src="/mozart.svg" alt="Mozart" class="size-16" />
      </hlm-empty-media>

      <hlm-empty-header>
        <h1 hlmH1 class="text-3xl">Start composing</h1>
        <p hlmLead class="text-base">Sign in to continue</p>
      </hlm-empty-header>

      <hlm-empty-content>
        <button
          hlmBtn
          type="button"
          [disabled]="state() === 'opening'"
          (click)="signIn.emit()"
        >
          {{ state() === 'opening' ? 'Opening browser…' : 'Sign in' }}
        </button>

        @if (state() === 'opening') {
          <p hlmMuted>Finish sign in in the browser window.</p>
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
  readonly signIn = output<void>();
  readonly cancelled = output<void>();
}
