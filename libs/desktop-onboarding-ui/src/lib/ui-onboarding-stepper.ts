import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Stepper chrome — renders progress dots + footer slots once and lets
// the page project the current step body via <ng-content>. Stays
// mounted across step changes so the dots/footer don't remount and
// snap-shift when the page switches `currentStep()`.
//
// Usage:
//   <app-onboarding-stepper [stepIndex]="i()" [totalSteps]="n">
//     @switch (step()) {
//       @case ('welcome') { <app-feature-step-welcome /> }
//       ...
//     }
//   </app-onboarding-stepper>
//
// Steps that need footer buttons project them with the `[footer-left]`
// or `[footer-right]` selectors.
@Component({
  selector: 'app-onboarding-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col' },
  template: `
    <div class="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-8">
      <!-- Dots: always at same vertical position regardless of step content height -->
      <div
        class="flex shrink-0 justify-center gap-2"
        role="progressbar"
        [attr.aria-valuenow]="stepIndex()"
        [attr.aria-valuemin]="1"
        [attr.aria-valuemax]="totalSteps()"
        [attr.aria-label]="
          'Onboarding step ' + stepIndex() + ' of ' + totalSteps()
        "
      >
        @for (i of dots(); track i) {
          <span
            class="size-2 rounded-full transition-colors"
            [class.bg-foreground]="i <= stepIndex()"
            [class.bg-muted]="i > stepIndex()"
          ></span>
        }
      </div>
      <!-- Content: fills available space between dots and footer -->
      <div class="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-5">
        <ng-content />
      </div>
      <!-- Footer: always at same vertical position, left slot expands to push right slot right -->
      <div class="flex shrink-0 items-center gap-3">
        <div class="flex flex-1">
          <ng-content select="[footer-left]" />
        </div>
        <ng-content select="[footer-right]" />
      </div>
    </div>
  `,
})
export class UiOnboardingStepper {
  readonly stepIndex = input.required<number>();
  readonly totalSteps = input.required<number>();
  protected readonly dots = () =>
    Array.from({ length: this.totalSteps() }, (_, i) => i + 1);
}
