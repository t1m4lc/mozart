import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { OnboardingFacade } from './data/onboarding.facade';

// Step 1 of the onboarding wizard. Pure intro — sets expectations and
// hands off to step 2 (Git check) on `Let's go`. The facade is wired
// via the page; this feature only triggers the advance.
@Component({
  selector: 'app-feature-onboarding-step-welcome',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div class="space-y-6 text-center">
      <h1 class="text-2xl font-semibold">Welcome to Mozart</h1>
      <div class="space-y-2 text-sm text-muted-foreground">
        <p>Let's set up your environment in 4 quick steps.</p>
        <p>
          We'll check that you have Git installed, help you connect at
          least one LLM provider, optionally link GitHub, and then give
          you a quick tour.
        </p>
        <p class="text-xs">This takes ~2 minutes.</p>
      </div>
      <div class="flex justify-center pt-4">
        <button hlmBtn type="button" (click)="facade.advance()">
          Let's go
        </button>
      </div>
    </div>
  `,
})
export class FeatureOnboardingStepWelcome {
  protected readonly facade = inject(OnboardingFacade);
}
