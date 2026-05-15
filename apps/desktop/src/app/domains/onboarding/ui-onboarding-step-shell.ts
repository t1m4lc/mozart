import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Dumb shell wrapping each onboarding step. Provides the progress pill
// at the top + slotted footer for Skip/Continue buttons. Step features
// project their content into the default slot.
@Component({
  selector: 'app-ui-onboarding-step-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full flex-col items-center justify-center' },
  template: `
    <div class="w-full max-w-xl space-y-8 px-6 py-12">
      <div class="flex justify-center gap-2" role="presentation">
        @for (i of dots(); track i) {
          <span
            class="size-2 rounded-full transition-colors"
            [class.bg-foreground]="i <= stepIndex()"
            [class.bg-muted]="i > stepIndex()"
          ></span>
        }
      </div>
      <div class="text-center text-xs uppercase tracking-wide text-muted-foreground">
        Step {{ stepIndex() }} / {{ totalSteps() }}
      </div>
      <div class="space-y-6">
        <ng-content />
      </div>
      <div class="flex items-center justify-between gap-3">
        <ng-content select="[footer-left]" />
        <ng-content select="[footer-right]" />
      </div>
    </div>
  `,
})
export class UiOnboardingStepShell {
  readonly stepIndex = input.required<number>();
  readonly totalSteps = input.required<number>();
  protected readonly dots = () =>
    Array.from({ length: this.totalSteps() }, (_, i) => i + 1);
}
