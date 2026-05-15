import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  OnboardingFacade,
  UiOnboardingStepShell,
} from '../domains/onboarding';

// Phase 6 / Atom 1 — `/onboarding` route shell. Renders the current
// step's feature component based on `OnboardingFacade.currentStep()`.
// Atoms 2-4 plug in the real step features ; Atom 1 ships placeholder
// content so the route + guard can be exercised end-to-end.
@Component({
  selector: 'app-onboarding-page',
  imports: [HlmButtonImports, UiOnboardingStepShell],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-screen overflow-y-auto bg-background' },
  template: `
    <app-ui-onboarding-step-shell
      [stepIndex]="facade.stepIndex()"
      [totalSteps]="facade.totalSteps"
    >
      @switch (facade.currentStep()) {
        @case ('welcome') {
          <div class="space-y-3 text-center">
            <h1 class="text-2xl font-semibold">Welcome to Mozart</h1>
            <p class="text-sm text-muted-foreground">
              Let's set up your environment in 4 quick steps.
            </p>
          </div>
        }
        @case ('git') {
          <div class="space-y-2 text-center">
            <h2 class="text-lg font-medium">Step 2 — Install Git</h2>
            <p class="text-sm text-muted-foreground">Detection wired in Atom 2.</p>
          </div>
        }
        @case ('provider') {
          <div class="space-y-2 text-center">
            <h2 class="text-lg font-medium">Step 3 — Connect an LLM provider</h2>
            <p class="text-sm text-muted-foreground">Provider list wired in Atom 3.</p>
          </div>
        }
        @case ('github') {
          <div class="space-y-2 text-center">
            <h2 class="text-lg font-medium">Step 4 — Connect GitHub</h2>
            <p class="text-sm text-muted-foreground">GitHub connect wired in Atom 4.</p>
          </div>
        }
      }

      <button
        footer-left
        hlmBtn
        variant="ghost"
        type="button"
        [disabled]="facade.currentStep() === 'welcome'"
        (click)="facade.back()"
      >
        Back
      </button>
      @if (facade.currentStep() === 'github') {
        <button
          footer-right
          hlmBtn
          type="button"
          (click)="facade.complete()"
        >
          Finish
        </button>
      } @else {
        <button
          footer-right
          hlmBtn
          type="button"
          (click)="facade.advance()"
        >
          {{
            facade.currentStep() === 'welcome' ? "Let's go" : 'Continue'
          }}
        </button>
      }
    </app-ui-onboarding-step-shell>
  `,
})
export class OnboardingPage {
  protected readonly facade = inject(OnboardingFacade);
}
