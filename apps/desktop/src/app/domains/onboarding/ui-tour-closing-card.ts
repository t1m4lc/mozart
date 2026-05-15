import {
  ChangeDetectionStrategy,
  Component,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';

// Final card surfaced after the 5th tour step. Pure dumb component —
// emits `(finish)` on the Finish button click ; the parent
// (feature-tour) handles navigation back to `/`.
@Component({
  selector: 'app-ui-tour-closing-card',
  imports: [HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fixed inset-0 z-50 flex items-center justify-center bg-black/40',
  },
  template: `
    <div
      class="w-96 max-w-[90vw] rounded-md border bg-popover p-6 text-popover-foreground shadow-lg"
    >
      <h2 class="text-xl font-semibold">You're all set 🎉</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Send your first prompt in the composer, or explore the app. You can
        revisit this tour anytime from Settings.
      </p>
      <div class="mt-6 flex justify-end">
        <button hlmBtn type="button" (click)="onFinish()">Finish</button>
      </div>
    </div>
  `,
})
export class UiTourClosingCard {
  readonly done = output<void>();

  protected onFinish(): void {
    this.done.emit();
  }
}
