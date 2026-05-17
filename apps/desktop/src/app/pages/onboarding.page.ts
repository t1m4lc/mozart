import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TopBar } from '../core/window-controls/top-bar';
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
// feature owns its own affordances (Continue/Back/Skip) — the page
// frames the TopBar (Mozart logo + window controls) and the step
// shell (progress dots + slotted footer).
@Component({
  selector: 'app-onboarding-page',
  imports: [
    TopBar,
    UiOnboardingStepShell,
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
      <app-ui-onboarding-step-shell
        [stepIndex]="facade.stepIndex()"
        [totalSteps]="facade.totalSteps"
      >
        @switch (facade.currentStep()) {
          @case ('welcome') {
            @defer (on immediate) {
              <app-feature-onboarding-step-welcome />
            }
          }
          @case ('git') {
            @defer (on immediate) {
              <app-feature-onboarding-step-git />
            }
          }
          @case ('provider') {
            @defer (on immediate) {
              <app-feature-onboarding-step-provider />
            }
          }
          @case ('github') {
            @defer (on immediate) {
              <app-feature-onboarding-step-github />
            }
          }
        }
      </app-ui-onboarding-step-shell>
    </div>
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
}
