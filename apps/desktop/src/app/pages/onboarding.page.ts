import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FeatureOnboardingStepGit,
  FeatureOnboardingStepGithub,
  FeatureOnboardingStepProvider,
  FeatureOnboardingStepWelcome,
  OnboardingFacade,
  UiOnboardingStepShell,
} from '../domains/onboarding';

// Phase 6 / Atoms 1-4 — `/onboarding` route shell. Switches between
// step features driven by `OnboardingFacade.currentStep()`. Each
// feature owns its own affordances (Continue/Back/Skip) — the shell
// just frames the progress pill and handles the layout.
@Component({
  selector: 'app-onboarding-page',
  imports: [
    UiOnboardingStepShell,
    FeatureOnboardingStepWelcome,
    FeatureOnboardingStepGit,
    FeatureOnboardingStepProvider,
    FeatureOnboardingStepGithub,
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
          <app-feature-onboarding-step-github />
        }
      }
    </app-ui-onboarding-step-shell>
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
}
