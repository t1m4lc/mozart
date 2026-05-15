import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FeatureOnboardingStepGit,
  FeatureOnboardingStepProvider,
  FeatureOnboardingStepWelcome,
  OnboardingFacade,
  UiOnboardingStepShell,
} from '../domains/onboarding';

// Phase 6 / Atoms 1-4 — `/onboarding` route shell. Switches between
// step features driven by `OnboardingFacade.currentStep()`. Atom 2
// wires steps 1 + 2 ; Atoms 3-4 add steps 3-4.
@Component({
  selector: 'app-onboarding-page',
  imports: [
    UiOnboardingStepShell,
    FeatureOnboardingStepWelcome,
    FeatureOnboardingStepGit,
    FeatureOnboardingStepProvider,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-screen overflow-y-auto bg-background' },
  template: `
    <app-ui-onboarding-step-shell
      [stepIndex]="facade.stepIndex()"
      [totalSteps]="facade.totalSteps"
    >
      @switch (facade.currentStep()) {
        @case ('welcome') {
          <app-feature-onboarding-step-welcome />
        }
        @case ('git') {
          <app-feature-onboarding-step-git />
        }
        @case ('provider') {
          <app-feature-onboarding-step-provider />
        }
        @case ('github') {
          <div class="space-y-2 text-center">
            <h2 class="text-lg font-medium">Step 4 — Connect GitHub</h2>
            <p class="text-sm text-muted-foreground">GitHub connect wired in Atom 4.</p>
          </div>
        }
      }
    </app-ui-onboarding-step-shell>
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
}
