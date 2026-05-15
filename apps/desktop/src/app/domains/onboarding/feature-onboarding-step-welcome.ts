import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { OnboardingFacade } from './data/onboarding.facade';

// Step 1 of the onboarding wizard. Pure intro — Enter or click on the
// CTA advances to the Git check.
@Component({
  selector: 'app-feature-onboarding-step-welcome',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6 text-center">
      <div class="mx-auto max-w-md space-y-2">
        <h1 class="text-2xl font-semibold tracking-tight">
          Welcome to Mozart
        </h1>
        <p class="text-muted-foreground text-sm">
          Let's set up your environment — takes about a minute.
        </p>
      </div>
      <div class="flex justify-center pt-2">
        <button hlmBtn type="button" (click)="onContinue()">
          Get started
        </button>
      </div>
    </div>
  `,
})
export class FeatureOnboardingStepWelcome {
  protected readonly facade = inject(OnboardingFacade);

  @HostListener('document:keyup.enter')
  protected onEnterKey(): void {
    this.onContinue();
  }

  protected onContinue(): void {
    this.facade.advance();
  }
}
