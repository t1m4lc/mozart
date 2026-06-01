import { ChangeDetectionStrategy, Component } from '@angular/core';

// Step 1 of the onboarding wizard. Pure intro — "Get started" button lives
// in the stepper's footer slot (onboarding.page.ts).
@Component({
  selector: 'app-feature-onboarding-step-welcome',
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
    </div>
  `,
})
export class FeatureOnboardingStepWelcome {}
