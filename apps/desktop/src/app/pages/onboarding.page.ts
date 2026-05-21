import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TopBar } from '../core/window-controls/top-bar';
import {
  FeatureOnboardingStepGit,
  FeatureOnboardingStepGithub,
  FeatureOnboardingStepProvider,
  FeatureOnboardingStepWelcome,
  OnboardingFacade,
  UiOnboardingStepper,
} from '../domains/onboarding';

// `/onboarding` route shell. The stepper wrapper renders the progress
// dots once and stays mounted while `facade.currentStep()` swaps the
// projected step body. @defer was removed — defer's loading-phase
// placeholder caused a visible 1-frame layout jump between steps.
@Component({
  selector: 'app-onboarding-page',
  imports: [
    TopBar,
    UiOnboardingStepper,
    FeatureOnboardingStepWelcome,
    FeatureOnboardingStepGit,
    FeatureOnboardingStepProvider,
    FeatureOnboardingStepGithub,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-screen w-full flex-col overflow-hidden bg-background' },
  template: `
    <app-top-bar />
    <div class="flex-1 overflow-y-auto">
      <app-onboarding-stepper
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
            <app-feature-onboarding-step-github />
          }
        }
      </app-onboarding-stepper>
    </div>
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
}
