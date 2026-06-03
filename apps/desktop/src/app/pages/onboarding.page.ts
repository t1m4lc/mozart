import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TopBar } from '@mozart/desktop-core-ui';
import { OnboardingFacade } from '@mozart/desktop-onboarding-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { UiOnboardingStepper } from '@mozart/desktop-onboarding-ui';
import {
  FeatureOnboardingStepGit,
  FeatureOnboardingStepGithub,
  FeatureOnboardingStepProvider,
  FeatureOnboardingStepWelcome,
} from '@mozart/desktop-onboarding-feature';
import { HlmButtonImports } from '@spartan-ui/button';
import { MzLoader } from '@mozart-ui/loader';

// `/onboarding` route shell. The stepper wrapper renders the progress
// dots once and stays mounted while `facade.currentStep()` swaps the
// projected step body. Footer navigation buttons live here (projected
// into the stepper's footer slots) so they stay at a fixed position
// regardless of step content height.
@Component({
  selector: 'app-onboarding-page',
  imports: [
    TopBar,
    UiOnboardingStepper,
    FeatureOnboardingStepWelcome,
    FeatureOnboardingStepGit,
    FeatureOnboardingStepProvider,
    FeatureOnboardingStepGithub,
    HlmButtonImports,
    MzLoader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-screen w-full flex-col overflow-hidden bg-background' },
  template: `
    <app-top-bar />

    @if (facade.completing()) {
      <!-- Full-screen centered loader: no dots, no nav buttons -->
      <div
        class="flex flex-1 items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <mz-loader
            variant="simple"
            size="md"
            class="text-brand"
            aria-label="Setting up your workspace"
          />
          <div class="space-y-1">
            <p class="text-sm font-medium">Setting up your workspace</p>
            <p class="text-muted-foreground text-xs">
              Cloning the get-started project and wiring it up — a few seconds.
            </p>
          </div>
        </div>
      </div>
    } @else {
      <div class="flex-1 overflow-hidden">
        <app-onboarding-stepper
          [stepIndex]="facade.stepIndex()"
          [totalSteps]="facade.totalSteps"
        >
          <!-- Step content -->
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

          <!-- Footer left slot: Back button on steps that have one -->
          @switch (facade.currentStep()) {
            @case ('provider') {
              <button footer-left hlmBtn variant="ghost" type="button" (click)="facade.back()">Back</button>
            }
            @case ('github') {
              <button footer-left hlmBtn variant="ghost" type="button" (click)="facade.back()">Back</button>
            }
          }

          <!-- Footer right slot: primary action per step -->
          @switch (facade.currentStep()) {
            @case ('welcome') {
              <button footer-right hlmBtn type="button" (click)="facade.advance()">Get started</button>
            }
            @case ('git') {
              <button footer-right hlmBtn type="button" [disabled]="!facade.canAdvance()" (click)="facade.advance()">Continue</button>
            }
            @case ('provider') {
              <button footer-right hlmBtn type="button" [disabled]="!facade.canAdvance()" (click)="facade.advance()">Continue</button>
            }
            @case ('github') {
              <button footer-right hlmBtn type="button" (click)="onFinish()">
                {{ profile.githubConnected() ? 'Finish' : 'Skip and finish' }}
              </button>
            }
          }
        </app-onboarding-stepper>
      </div>
    }
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
  protected readonly profile = inject(ProfileFacade);

  protected onFinish(): void {
    void this.facade.finishGithub();
  }
}
